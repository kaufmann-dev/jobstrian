import { createHash } from 'node:crypto';
import { chatJson, type LlmConfig } from './client';
import type { LlmLimiter } from './limiter';

export const EMAIL_QUALITY_PROMPT_VERSION = 'lead-email-quality-v1';
export const EMAIL_QUALITY_BATCH_SIZE = 25;

export type LeadEmailQualityStatus = 'accepted' | 'rejected';

export interface LeadEmailQualityCandidate {
	id: number;
	name: string;
	category: string | null;
	website: string | null;
	email: string;
	emailSource: 'osm' | 'website' | null;
}

export interface LeadEmailQualityResult {
	id: number;
	status: LeadEmailQualityStatus;
	reason: string;
	hash: string;
}

export interface LeadEmailQualityReviewProgress {
	reviewed: number;
	total: number;
	accepted: number;
	rejected: number;
	failedBatches: number;
}

export type LeadEmailQualityProgressCallback = (
	progress: LeadEmailQualityReviewProgress
) => void | Promise<void>;

type LlmEmailQualityResponse = {
	decisions?: LlmEmailQualityDecision[];
};

type LlmEmailQualityDecision = {
	id?: string | number;
	status?: string;
	reason?: string;
};

const REJECTED_LOCAL_PARTS = new Set([
	'abuse',
	'bounce',
	'bounces',
	'datenschutz',
	'donotreply',
	'do-not-reply',
	'dsgvo',
	'legal',
	'mailer-daemon',
	'newsletter',
	'noreply',
	'no-reply',
	'postmaster',
	'privacy',
	'sentry',
	'webmaster'
]);

const PROTECTED_ACCEPT_LOCAL_PARTS = new Set([
	'admin',
	'bewerbung',
	'bewerbungen',
	'career',
	'careers',
	'contact',
	'hallo',
	'hello',
	'hr',
	'info',
	'job',
	'jobs',
	'karriere',
	'kontakt',
	'mail',
	'office',
	'personal',
	'recruiting',
	'talent'
]);

const PLACEHOLDER_LOCAL_RE = /^(example|test|your|name|email|user|kontaktformular)$/i;
const RANDOM_LOCAL_RE =
	/^(?:[a-f0-9]{24,}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const TECHNICAL_DOMAIN_RE = /(^|\.)wixpress\.com$|(^|\.)sentry\.io$|(^|\.)sentry-next\./i;

function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, current) => (current === undefined ? null : current));
}

function hash(value: unknown): string {
	return createHash('sha256').update(canonical(value)).digest('hex');
}

function splitEmail(email: string): { local: string; domain: string } | null {
	const normalized = email.trim().toLowerCase();
	const at = normalized.lastIndexOf('@');
	if (at <= 0 || at === normalized.length - 1) return null;
	return {
		local: normalized.slice(0, at),
		domain: normalized.slice(at + 1)
	};
}

function compactReason(value: unknown, fallback: string): string {
	const reason = (value ?? '').toString().trim().replace(/\s+/g, ' ');
	return (reason || fallback).slice(0, 240);
}

function protectedAcceptLocalPart(email: string): boolean {
	const parts = splitEmail(email);
	if (!parts) return false;
	const normalized = parts.local.replace(/[._+-]/g, '');
	const firstSegment = parts.local.split(/[._+-]/)[0];
	return (
		PROTECTED_ACCEPT_LOCAL_PARTS.has(parts.local) ||
		PROTECTED_ACCEPT_LOCAL_PARTS.has(normalized) ||
		PROTECTED_ACCEPT_LOCAL_PARTS.has(firstSegment)
	);
}

export function leadEmailQualityHash(candidate: LeadEmailQualityCandidate): string {
	return hash({
		promptVersion: EMAIL_QUALITY_PROMPT_VERSION,
		name: candidate.name,
		category: candidate.category,
		website: candidate.website,
		email: candidate.email,
		emailSource: candidate.emailSource
	});
}

export function deterministicLeadEmailReview(
	email: string
): { status: 'rejected'; reason: string } | null {
	const parts = splitEmail(email);
	if (!parts) return { status: 'rejected', reason: 'ungueltiges E-Mail-Format' };

	const localKey = parts.local.replace(/[._+-]/g, '');
	if (PLACEHOLDER_LOCAL_RE.test(parts.local)) {
		return { status: 'rejected', reason: 'Platzhalter-Adresse' };
	}
	if (REJECTED_LOCAL_PARTS.has(parts.local) || REJECTED_LOCAL_PARTS.has(localKey)) {
		return { status: 'rejected', reason: 'Rollenadresse ist fuer Bewerbungen ungeeignet' };
	}
	if (RANDOM_LOCAL_RE.test(parts.local)) {
		return { status: 'rejected', reason: 'lokaler Teil wirkt wie technischer Zufallswert' };
	}
	if (
		parts.domain === 'example.com' ||
		parts.domain === 'localhost' ||
		parts.domain.endsWith('.invalid') ||
		parts.domain.endsWith('.test')
	) {
		return { status: 'rejected', reason: 'Test- oder Platzhalter-Domain' };
	}
	if (TECHNICAL_DOMAIN_RE.test(parts.domain)) {
		return { status: 'rejected', reason: 'technische Provider- oder Fehlertracking-Domain' };
	}
	return null;
}

function fallbackAccepted(candidate: LeadEmailQualityCandidate): LeadEmailQualityResult {
	return {
		id: candidate.id,
		status: 'accepted',
		reason: 'plausible Geschaeftsadresse',
		hash: leadEmailQualityHash(candidate)
	};
}

function deterministicResult(candidate: LeadEmailQualityCandidate): LeadEmailQualityResult | null {
	const decision = deterministicLeadEmailReview(candidate.email);
	if (!decision) return null;
	return {
		id: candidate.id,
		status: decision.status,
		reason: decision.reason,
		hash: leadEmailQualityHash(candidate)
	};
}

function chunks<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

export const EMAIL_QUALITY_SYSTEM_PROMPT = `Du pruefst E-Mail-Adressen fuer Initiativbewerbungen an Betriebe in Oesterreich.
Arbeite mit hoher Recall-Prioritaet: eine echte verwendbare Adresse faelschlich abzulehnen ist schlimmer, als eine fragliche Adresse zu behalten.
In vielen Batches wird keine einzige Adresse klar ungeeignet sein. Null Ablehnungen sind ein gueltiges und erfolgreiches Ergebnis.
Akzeptiere Recruiting-, Karriere-, Personal-, Bewerbungs- und allgemeine Geschaeftsadressen wie info@, office@, kontakt@, mail@, hello@ oder hallo@.
Lehne nur ab, wenn die Unbrauchbarkeit aus Adresse oder Domain selbst offensichtlich ist: no-reply, Bounce-/Systemadressen, Datenschutz-/Rechtsadressen, Newsletter, Fehlertracking, technische Provider-Adressen, klare zufaellige Hash-Adressen oder Platzhalter.
Wenn eine Adresse unsicher, aber als Betriebskontakt plausibel ist, akzeptiere sie.
Antworte ausschliesslich als JSON-Objekt:
{"decisions":[{"id":"<ID>","status":"accepted|rejected","reason":"<kurzer deutscher Grund>"}]}
Gib fuer jede Eingabe genau eine Entscheidung zurueck.`;

function userPrompt(candidates: LeadEmailQualityCandidate[]): string {
	return JSON.stringify({
		candidates: candidates.map((candidate) => ({
			id: String(candidate.id),
			email: candidate.email,
			betrieb: candidate.name,
			kategorie: candidate.category,
			website: candidate.website,
			quelle: candidate.emailSource
		}))
	});
}

function parseLlmResults(
	candidates: LeadEmailQualityCandidate[],
	raw: LlmEmailQualityResponse
): LeadEmailQualityResult[] {
	const byId = new Map<string, LlmEmailQualityDecision>();
	for (const decision of raw.decisions ?? []) {
		if (decision?.id == null) continue;
		byId.set(String(decision.id), decision);
	}

	return candidates.map((candidate) => {
		const decision = byId.get(String(candidate.id));
		const llmStatus = decision?.status === 'rejected' ? 'rejected' : 'accepted';
		const protectedOverride = llmStatus === 'rejected' && protectedAcceptLocalPart(candidate.email);
		const status = protectedOverride ? 'accepted' : llmStatus;
		return {
			id: candidate.id,
			status,
			reason: compactReason(
				protectedOverride ? 'geschuetzte plausible Geschaeftsadresse' : decision?.reason,
				status === 'rejected'
					? 'LLM bewertet Adresse als ungeeignet'
					: 'plausible Geschaeftsadresse'
			),
			hash: leadEmailQualityHash(candidate)
		};
	});
}

export async function reviewLeadEmailCandidates(
	cfg: LlmConfig,
	candidates: LeadEmailQualityCandidate[],
	limiter: LlmLimiter,
	signal?: AbortSignal,
	onProgress?: LeadEmailQualityProgressCallback
): Promise<LeadEmailQualityResult[]> {
	const results = new Map<number, LeadEmailQualityResult>();
	const llmWork: LeadEmailQualityCandidate[] = [];
	let failedBatches = 0;

	const emitProgress = async () => {
		if (!onProgress) return;
		let accepted = 0;
		let rejected = 0;
		for (const result of results.values()) {
			if (result.status === 'rejected') rejected++;
			else accepted++;
		}
		await onProgress({
			reviewed: results.size,
			total: candidates.length,
			accepted,
			rejected,
			failedBatches
		});
	};

	for (const candidate of candidates) {
		const deterministic = deterministicResult(candidate);
		if (deterministic) results.set(candidate.id, deterministic);
		else llmWork.push(candidate);
	}
	await emitProgress();

	for (const batch of chunks(llmWork, EMAIL_QUALITY_BATCH_SIZE)) {
		try {
			const raw = await chatJson<LlmEmailQualityResponse>(
				cfg,
				[
					{ role: 'system', content: EMAIL_QUALITY_SYSTEM_PROMPT },
					{ role: 'user', content: userPrompt(batch) }
				],
				{ temperature: 0, limiter, signal }
			);
			for (const result of parseLlmResults(batch, raw)) {
				results.set(result.id, result);
			}
		} catch (err) {
			if (signal?.aborted) throw err;
			failedBatches++;
			console.error('[llm] E-Mail-Qualitaetspruefung fehlgeschlagen:', err);
			for (const candidate of batch) {
				results.set(candidate.id, fallbackAccepted(candidate));
			}
		}
		await emitProgress();
	}

	return candidates.map((candidate) => results.get(candidate.id) ?? fallbackAccepted(candidate));
}
