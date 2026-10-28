import { asc, eq, inArray } from 'drizzle-orm';
import { getAppSettings } from '../app-settings';
import { db } from '../db';
import {
	llmConnection,
	llmModel,
	type LlmConnection,
	type LlmModel,
	type Person
} from '../db/schema';
import { LLM_REASONING_LABELS, type LlmApiType, type LlmReasoningEffort } from '#lib/llm.js';
import { verificationResponse } from './response-schemas';
import { chatJson, llmHeaders, LlmNotConfiguredError, type LlmConfig } from './client';
import { LlmLimiter } from './limiter';

/** A connection as shown in the UI: the API key itself is never sent to the client. */
export type LlmConnectionView = Omit<LlmConnection, 'apiKey'> & {
	hasApiKey: boolean;
	models: LlmModel[];
};

export type LlmStatus = {
	configured: boolean;
	verified: boolean;
	verifiedAt: Date | null;
	/** "<model> · <connection>[ · Reasoning: <level>]" of the resolved model, if any. */
	label: string | null;
	/** True when the person has no model of their own and the app default applies. */
	usesDefault: boolean;
};

export async function listConnections(): Promise<LlmConnectionView[]> {
	const [connections, models] = await Promise.all([
		db.select().from(llmConnection).orderBy(asc(llmConnection.id)),
		db.select().from(llmModel).orderBy(asc(llmModel.modelId))
	]);
	return connections.map(({ apiKey, ...connection }) => ({
		...connection,
		hasApiKey: Boolean(apiKey),
		models: models.filter((model) => model.connectionId === connection.id)
	}));
}

export interface ConnectionInput {
	apiType: LlmApiType;
	name: string;
	baseUrl: string;
	/** Empty keeps the stored key on update. */
	apiKey?: string;
	requestsPerMinute: number;
	maxConcurrent: number;
}

export async function createConnection(input: ConnectionInput): Promise<LlmConnection> {
	const inserted = await db
		.insert(llmConnection)
		.values({
			name: input.name.trim(),
			apiType: input.apiType,
			baseUrl: input.baseUrl.trim(),
			apiKey: input.apiKey ?? '',
			requestsPerMinute: input.requestsPerMinute,
			maxConcurrent: input.maxConcurrent
		})
		.returning();
	return inserted[0];
}

/** Update a connection; changing the endpoint or key invalidates its models' verification. */
export async function updateConnection(id: number, input: ConnectionInput): Promise<LlmConnection> {
	const [current] = await db.select().from(llmConnection).where(eq(llmConnection.id, id)).limit(1);
	if (!current) throw new Error('KI-Verbindung nicht gefunden.');
	const baseUrl = input.baseUrl.trim();
	const apiKey = input.apiKey ? input.apiKey : current.apiKey;
	const updated = await db
		.update(llmConnection)
		.set({
			name: input.name.trim(),
			apiType: input.apiType,
			baseUrl,
			apiKey,
			requestsPerMinute: input.requestsPerMinute,
			maxConcurrent: input.maxConcurrent
		})
		.where(eq(llmConnection.id, id))
		.returning();
	if (
		input.apiType !== current.apiType ||
		baseUrl !== current.baseUrl ||
		apiKey !== current.apiKey
	) {
		await db
			.update(llmModel)
			.set({ verified: false, verifiedAt: null })
			.where(eq(llmModel.connectionId, id));
	}
	return updated[0];
}

export async function deleteConnection(id: number): Promise<void> {
	await db.delete(llmConnection).where(eq(llmConnection.id, id));
}

export async function addModels(connectionId: number, modelIds: string[]): Promise<void> {
	const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))];
	if (unique.length === 0) return;
	await db
		.insert(llmModel)
		.values(unique.map((modelId) => ({ connectionId, modelId })))
		.onConflictDoNothing();
}

/** Changing the reasoning level changes every request, so the model must be verified again. */
export async function setModelReasoningEffort(
	id: number,
	reasoningEffort: LlmReasoningEffort | null
): Promise<void> {
	await db
		.update(llmModel)
		.set({ reasoningEffort, verified: false, verifiedAt: null })
		.where(eq(llmModel.id, id));
}

export async function removeModel(id: number): Promise<void> {
	await db.delete(llmModel).where(eq(llmModel.id, id));
}

/** Pull model ids out of the different shapes OpenAI-compatible `/models` endpoints return. */
export function parseModelList(body: unknown): string[] {
	const list = Array.isArray(body)
		? body
		: body && typeof body === 'object'
			? ((body as { data?: unknown; models?: unknown }).data ??
				(body as { models?: unknown }).models)
			: null;
	if (!Array.isArray(list)) return [];
	const ids = list
		.map((entry) => {
			if (typeof entry === 'string') return entry;
			if (entry && typeof entry === 'object') {
				const record = entry as { id?: unknown; name?: unknown };
				if (typeof record.id === 'string') return record.id;
				if (typeof record.name === 'string') return record.name;
			}
			return '';
		})
		.map((id) => id.replace(/^models\//, '').trim())
		.filter(Boolean);
	return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** Ask the endpoint which models it offers. Throws a German message on failure. */
export async function fetchAvailableModels(connectionId: number): Promise<string[]> {
	const [connection] = await db
		.select()
		.from(llmConnection)
		.where(eq(llmConnection.id, connectionId))
		.limit(1);
	if (!connection) throw new Error('KI-Verbindung nicht gefunden.');
	return discoverModels(connection);
}

/** Fetch all native Claude pages; other providers return their model list in one response. */
export async function discoverModels(
	connection: Pick<LlmConnection, 'apiType' | 'baseUrl' | 'apiKey'>
): Promise<string[]> {
	const ids = new Set<string>();
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	const signal = AbortSignal.timeout(15_000);
	do {
		const url = new URL(connection.baseUrl.replace(/\/+$/, '') + '/models');
		if (connection.apiType === 'anthropic') {
			url.searchParams.set('limit', '1000');
			if (cursor) url.searchParams.set('after_id', cursor);
		}
		let res: Response;
		try {
			res = await fetch(url, { headers: llmHeaders(connection), signal });
		} catch {
			throw new Error(
				'Die Modellliste konnte nicht abgerufen werden. Trage das Modell manuell ein.'
			);
		}
		if (!res.ok)
			throw new Error(
				`Die Modellliste konnte nicht abgerufen werden (${res.status}). Trage das Modell manuell ein.`
			);
		const body: unknown = await res.json().catch(() => null);
		for (const id of parseModelList(body)) ids.add(id);
		const page = body as { has_more?: boolean; last_id?: string } | null;
		cursor = connection.apiType === 'anthropic' && page?.has_more ? (page.last_id ?? null) : null;
		if (
			connection.apiType === 'anthropic' &&
			page?.has_more &&
			(!cursor || seenCursors.has(cursor))
		) {
			throw new Error(
				'Die Modellliste enthält eine ungültige nächste Seite. Trage das Modell manuell ein.'
			);
		}
		if (cursor) seenCursors.add(cursor);
	} while (cursor);
	if (!ids.size)
		throw new Error('Der Endpunkt hat keine Modelle geliefert. Trage das Modell manuell ein.');
	return [...ids].sort((a, b) => a.localeCompare(b));
}

async function modelConfig(modelRowId: number): Promise<LlmConfig | null> {
	const rows = await db
		.select({ model: llmModel, connection: llmConnection })
		.from(llmModel)
		.innerJoin(llmConnection, eq(llmConnection.id, llmModel.connectionId))
		.where(eq(llmModel.id, modelRowId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return {
		connectionId: row.connection.id,
		apiType: row.connection.apiType,
		modelRowId: row.model.id,
		baseUrl: row.connection.baseUrl,
		apiKey: row.connection.apiKey,
		model: row.model.modelId,
		reasoningEffort: row.model.reasoningEffort,
		requestsPerMinute: row.connection.requestsPerMinute,
		maxConcurrent: row.connection.maxConcurrent,
		verified: row.model.verified
	};
}

/** The model row id that applies to a person: their own choice or the app default. */
export async function effectiveModelId(
	person: Pick<Person, 'llmModelId'>
): Promise<{ id: number | null; usesDefault: boolean }> {
	if (person.llmModelId != null) return { id: person.llmModelId, usesDefault: false };
	return { id: (await getAppSettings()).defaultLlmModelId, usesDefault: true };
}

/** Resolve the model a person's LLM work runs on. Throws `LlmNotConfiguredError` when none. */
export async function getLlmConfig(person: Pick<Person, 'llmModelId' | 'id'>): Promise<LlmConfig> {
	const { id } = await effectiveModelId(person);
	const config = id == null ? null : await modelConfig(id);
	if (!config) throw new LlmNotConfiguredError();
	return { ...config, personId: person.id };
}

export async function llmStatusFor(person: Pick<Person, 'llmModelId'>): Promise<LlmStatus> {
	const { id, usesDefault } = await effectiveModelId(person);
	const rows =
		id == null
			? []
			: await db
					.select({ model: llmModel, connection: llmConnection })
					.from(llmModel)
					.innerJoin(llmConnection, eq(llmConnection.id, llmModel.connectionId))
					.where(eq(llmModel.id, id))
					.limit(1);
	const row = rows[0];
	if (!row) {
		return { configured: false, verified: false, verifiedAt: null, label: null, usesDefault };
	}
	return {
		configured: true,
		verified: row.model.verified,
		verifiedAt: row.model.verifiedAt,
		label: [
			row.model.modelId,
			row.connection.name,
			row.model.reasoningEffort && `Reasoning: ${LLM_REASONING_LABELS[row.model.reasoningEffort]}`
		]
			.filter(Boolean)
			.join(' · '),
		usesDefault
	};
}

const limiters = new Map<number, LlmLimiter>();

/**
 * One limiter per connection, shared by every person and run so
 * concurrent work respects the provider's rate limit together.
 */
export function getLlmLimiter(config: LlmConfig): LlmLimiter {
	const key = config.connectionId;
	let limiter = limiters.get(key);
	if (!limiter) {
		limiter = new LlmLimiter({
			requestsPerMinute: config.requestsPerMinute,
			maxConcurrent: config.maxConcurrent
		});
		limiters.set(key, limiter);
	} else {
		limiter.configure(config);
	}
	return limiter;
}

/**
 * Send one real chat request to the saved model and persist the outcome. Success marks the
 * model verified; any failure clears it and rethrows so the caller can show the reason.
 */
export async function verifyLlmModel(modelRowId: number): Promise<LlmModel> {
	const config = await modelConfig(modelRowId);
	if (!config) throw new Error('Modell nicht gefunden.');
	try {
		await chatJson<unknown>(
			config,
			[
				{ role: 'system', content: 'Antworte ausschließlich mit einem JSON-Objekt.' },
				{ role: 'user', content: 'Gib {"ok":true} als JSON zurück.' }
			],
			{
				limiter: getLlmLimiter(config),
				maxAttempts: 1,
				temperature: 0,
				response: verificationResponse,
				maxOutputTokens: 1024
			}
		);
	} catch (err) {
		await db
			.update(llmModel)
			.set({ verified: false, verifiedAt: null })
			.where(eq(llmModel.id, modelRowId));
		throw err;
	}
	const updated = await db
		.update(llmModel)
		.set({ verified: true, verifiedAt: new Date() })
		.where(eq(llmModel.id, modelRowId))
		.returning();
	return updated[0];
}

/** Models that exist, by id (used to validate selections). */
export async function existingModelIds(ids: number[]): Promise<Set<number>> {
	if (ids.length === 0) return new Set();
	const rows = await db.select({ id: llmModel.id }).from(llmModel).where(inArray(llmModel.id, ids));
	return new Set(rows.map((row) => row.id));
}
