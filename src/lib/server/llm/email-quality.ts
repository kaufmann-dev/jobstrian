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

const PLACEHOLDER_LOCAL_RE = /^(example|test|your|name|email|mail|user|kontaktformular)$/i;
const RANDOM_LOCAL_RE = /^(?:[a-f0-9]{24,}|[a-z0-9]{32,})$/i;
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

const SYSTEM = `Du pruefst E-Mail-Adressen fuer Initiativbewerbungen an Betriebe in Oesterreich.
Akzeptiere Recruiting-, Karriere-, Personal-, Bewerbungs- und allgemeine Geschaeftsadressen wie kontakt@, office@ oder info@.
Lehne nur klar ungeeignete Adressen ab: no-reply, Bounce-/Systemadressen, Datenschutz-/Rechtsadressen, Newsletter, Fehlertracking, technische Provider-Adressen, zufaellige Hash-Adressen oder Platzhalter.
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
		const status = decision?.status === 'rejected' ? 'rejected' : 'accepted';
		return {
			id: candidate.id,
			status,
			reason: compactReason(
				decision?.reason,
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
	signal?: AbortSignal
): Promise<LeadEmailQualityResult[]> {
	const results = new Map<number, LeadEmailQualityResult>();
	const llmWork: LeadEmailQualityCandidate[] = [];

	for (const candidate of candidates) {
		const deterministic = deterministicResult(candidate);
		if (deterministic) results.set(candidate.id, deterministic);
		else llmWork.push(candidate);
	}

	for (const batch of chunks(llmWork, EMAIL_QUALITY_BATCH_SIZE)) {
		try {
			const raw = await chatJson<LlmEmailQualityResponse>(
				cfg,
				[
					{ role: 'system', content: SYSTEM },
					{ role: 'user', content: userPrompt(batch) }
				],
				{ temperature: 0, limiter, signal }
			);
			for (const result of parseLlmResults(batch, raw)) {
				results.set(result.id, result);
			}
		} catch (err) {
			if (signal?.aborted) throw err;
			console.error('[llm] E-Mail-Qualitaetspruefung fehlgeschlagen:', err);
			for (const candidate of batch) {
				results.set(candidate.id, fallbackAccepted(candidate));
			}
		}
	}

	return candidates.map((candidate) => results.get(candidate.id) ?? fallbackAccepted(candidate));
}
