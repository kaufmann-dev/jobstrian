import type { LlmApiType } from '#lib/llm.js';
import { responseJsonSchema, type LlmResponseSchema } from './response-schemas';
import { abortError, isAbortError, type LlmLimiter } from './limiter';

/** What a chat request needs to reach a model. */
export interface LlmEndpoint {
	apiType: LlmApiType;
	personId?: number;
	connectionId?: number;
	modelRowId?: number;
	baseUrl: string;
	apiKey: string;
	model: string;
}

/** A resolved saved model: endpoint plus the limits of its connection. */
export interface LlmConfig extends LlmEndpoint {
	connectionId: number;
	modelRowId: number;
	requestsPerMinute: number;
	maxConcurrent: number;
	verified: boolean;
}

export class LlmNotConfiguredError extends Error {
	constructor() {
		super('Kein KI-Modell ausgewählt. Lege unter Einstellungen eine KI-Verbindung mit Modell an.');
		this.name = 'LlmNotConfiguredError';
	}
}

export class LlmHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly retryAfterMs?: number
	) {
		super(message);
		this.name = 'LlmHttpError';
	}
}

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);

export function isRetryableLlmError(error: unknown): boolean {
	if (isAbortError(error) || error instanceof LlmResponseError) return false;
	if (error instanceof LlmHttpError) {
		return RETRYABLE_STATUSES.has(error.status) || error.status >= 500;
	}
	return (
		error instanceof TypeError ||
		error instanceof SyntaxError ||
		(error instanceof DOMException && error.name === 'TimeoutError')
	);
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(signal.reason ?? abortError());
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason ?? abortError());
			},
			{ once: true }
		);
	});
}

function attemptSignal(
	signal?: AbortSignal,
	timeoutMs = 60_000
): {
	signal: AbortSignal;
	cleanup: () => void;
} {
	const timeout = new AbortController();
	const timer = setTimeout(
		() =>
			timeout.abort(
				new DOMException('LLM-Anfrage hat das Zeitlimit überschritten.', 'TimeoutError')
			),
		timeoutMs
	);
	return {
		signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
		cleanup: () => clearTimeout(timer)
	};
}

export class LlmResponseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LlmResponseError';
	}
}

export function llmHeaders(cfg: Pick<LlmEndpoint, 'apiType' | 'apiKey'>): Record<string, string> {
	return cfg.apiType === 'anthropic'
		? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
		: cfg.apiKey
			? { authorization: `Bearer ${cfg.apiKey}` }
			: {};
}

interface ProviderResponse {
	status?: string;
	stop_reason?: string;
	content?: { type: string; text?: string }[];
	output?: { type: string; content?: { type: string; text?: string }[] }[];
	choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[];
	usage?: Record<string, unknown>;
}

export function normalizeUsage(apiType: LlmApiType, usage?: Record<string, unknown>) {
	const n = (v: unknown): number | null =>
		typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
	const details = (
		apiType === 'openai' ? usage?.input_tokens_details : usage?.prompt_tokens_details
	) as Record<string, unknown> | undefined;
	const cached = n(
		apiType === 'anthropic' ? usage?.cache_read_input_tokens : details?.cached_tokens
	);
	const writes = n(
		apiType === 'anthropic' ? usage?.cache_creation_input_tokens : details?.cache_write_tokens
	);
	const input = n(apiType === 'openai-compatible' ? usage?.prompt_tokens : usage?.input_tokens);
	return {
		inputTokens:
			apiType === 'anthropic' && input !== null ? input + (cached ?? 0) + (writes ?? 0) : input,
		outputTokens: n(
			apiType === 'openai-compatible' ? usage?.completion_tokens : usage?.output_tokens
		),
		cachedInputTokens: cached,
		cacheWriteTokens: writes
	};
}

function responseText(apiType: LlmApiType, data: ProviderResponse): string {
	if (apiType === 'anthropic') {
		if (data.stop_reason === 'refusal')
			throw new LlmResponseError('Die KI hat die Anfrage abgelehnt.');
		if (data.stop_reason !== 'end_turn')
			throw new LlmResponseError('Die KI-Antwort ist unvollständig. Prüfe das Ausgabelimit.');
		return (
			data.content
				?.filter((b) => b.type === 'text')
				.map((b) => b.text ?? '')
				.join('') ?? ''
		);
	}
	if (apiType === 'openai') {
		if (data.output?.some((item) => item.content?.some((b) => b.type === 'refusal'))) {
			throw new LlmResponseError('Die KI hat die Anfrage abgelehnt.');
		}
		if (data.status !== 'completed')
			throw new LlmResponseError('Die KI-Antwort ist unvollständig. Prüfe das Ausgabelimit.');
		return (
			data.output
				?.filter((item) => item.type === 'message')
				.flatMap((item) => item.content ?? [])
				.filter((b) => b.type === 'output_text')
				.map((b) => b.text ?? '')
				.join('') ?? ''
		);
	}
	const choice = data.choices?.[0];
	if (choice?.message?.refusal || choice?.finish_reason === 'content_filter')
		throw new LlmResponseError('Die KI hat die Anfrage abgelehnt.');
	if (choice?.finish_reason && choice.finish_reason !== 'stop')
		throw new LlmResponseError('Die KI-Antwort ist unvollständig. Prüfe das Ausgabelimit.');
	return choice?.message?.content ?? '';
}

/** Strip ```json fences some models wrap around their output. */
function unfence(text: string): string {
	const trimmed = text.trim();
	const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return (fence ? fence[1] : trimmed).trim();
}

/**
 * Request and validate JSON through the explicitly selected API protocol.
 */
export async function chatJson<T>(
	cfg: LlmEndpoint,
	messages: { role: 'system' | 'user'; content: string }[],
	opts: {
		response: LlmResponseSchema;
		context?: string;
		maxOutputTokens?: number;
		temperature?: number;
		signal?: AbortSignal;
		limiter: LlmLimiter;
		maxAttempts?: number;
		timeoutMs?: number;
		sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
		random?: () => number;
	}
): Promise<T> {
	const maxAttempts = opts.maxAttempts ?? 3;
	const system = messages
		.filter((m) => m.role === 'system')
		.map((m) => m.content)
		.join('\n');
	const input = messages
		.filter((m) => m.role === 'user')
		.map((m) => m.content)
		.join('\n');
	const maxTokens = opts.maxOutputTokens ?? 8192;
	const schema = responseJsonSchema(opts.response);
	const userBlocks = [
		...(opts.context
			? [{ type: 'text', text: opts.context, cache_control: { type: 'ephemeral', ttl: '5m' } }]
			: []),
		{ type: 'text', text: input }
	];
	const path =
		cfg.apiType === 'openai'
			? '/responses'
			: cfg.apiType === 'anthropic'
				? '/messages'
				: '/chat/completions';
	const body =
		cfg.apiType === 'openai'
			? {
					model: cfg.model,
					store: false,
					max_output_tokens: maxTokens,
					input: [
						{ role: 'developer', content: system },
						{
							role: 'user',
							content: [
								...(opts.context ? [{ type: 'input_text', text: opts.context }] : []),
								{ type: 'input_text', text: input }
							]
						}
					],
					text: { format: { type: 'json_schema', name: opts.response.name, strict: true, schema } }
				}
			: cfg.apiType === 'anthropic'
				? {
						model: cfg.model,
						system,
						max_tokens: maxTokens,
						messages: [{ role: 'user', content: userBlocks }],
						output_config: { format: { type: 'json_schema', schema } }
					}
				: {
						model: cfg.model,
						temperature: opts.temperature ?? 0.2,
						max_tokens: maxTokens,
						response_format: { type: 'json_object' },
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: [opts.context, input].filter(Boolean).join('\n\n') }
						]
					};
	const sleep = opts.sleep ?? delay;
	const random = opts.random ?? Math.random;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		if (opts.signal?.aborted) throw opts.signal.reason ?? abortError();
		try {
			return await opts.limiter.run(async (limiterSignal) => {
				const request = attemptSignal(limiterSignal, opts.timeoutMs);
				try {
					const started = Date.now();
					const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + path, {
						method: 'POST',
						headers: { 'content-type': 'application/json', ...llmHeaders(cfg) },
						body: JSON.stringify(body),
						signal: request.signal
					});
					const data = (await res.json().catch(() => {
						if (request.signal.aborted) throw request.signal.reason;
						return null;
					})) as ProviderResponse | null;
					console.info(
						'[llm-usage]',
						JSON.stringify({
							apiType: cfg.apiType,
							connectionId: cfg.connectionId ?? null,
							modelId: cfg.modelRowId ?? null,
							model: cfg.model,
							personId: cfg.personId ?? null,
							purpose: opts.response.name,
							attempt,
							status: res.status,
							durationMs: Date.now() - started,
							...normalizeUsage(cfg.apiType, data?.usage)
						})
					);
					if (!res.ok) {
						throw new LlmHttpError(
							res.status,
							`LLM-Anfrage fehlgeschlagen (${res.status}).${res.status === 400 ? ' Prüfe Modell und Unterstützung für strukturierte Ausgaben.' : res.status === 404 ? ' Prüfe Modell und API-Endpunkt.' : ''}`,
							parseRetryAfter(res.headers.get('retry-after'))
						);
					}
					if (!data) throw new SyntaxError('LLM hat keine gültige Antwort zurückgegeben.');
					const content = responseText(cfg.apiType, data);
					if (!content) throw new SyntaxError('LLM hat keinen Inhalt zurückgegeben.');
					const raw: unknown = JSON.parse(
						cfg.apiType === 'openai-compatible' ? unfence(content) : content
					);
					const parsed = opts.response.schema.safeParse(raw);
					if (!parsed.success)
						throw new LlmResponseError('Die KI-Antwort entspricht nicht dem erwarteten Schema.');
					return parsed.data as T;
				} finally {
					request.cleanup();
				}
			}, opts.signal);
		} catch (error) {
			if (opts.signal?.aborted || isAbortError(error)) throw error;
			lastError = error;
			if (attempt === maxAttempts || !isRetryableLlmError(error)) throw error;
			const retryAfter = error instanceof LlmHttpError ? error.retryAfterMs : undefined;
			const backoff = 500 * 2 ** (attempt - 1);
			await sleep(retryAfter ?? Math.round(backoff * (0.75 + random() * 0.5)), opts.signal);
		}
	}
	throw lastError;
}
