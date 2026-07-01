import type { RunPhaseFailureReason } from './db/schema';
import { LlmHttpError } from './llm/client';

/**
 * Surface the real failure reason. Drizzle wraps DB errors so `err.message` is
 * only the `Failed query: … params: …` text; the actual Postgres message lives
 * in `err.cause`. Lead with the cause so the detail is readable.
 */
export function errorCauseMessage(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	const cause = (err as { cause?: unknown }).cause;
	const causeMsg = cause instanceof Error ? cause.message : undefined;
	return causeMsg && causeMsg !== err.message ? `${causeMsg} — ${err.message}` : err.message;
}

/**
 * Classify a per-item run failure into a stable `code` (for grouping/counting)
 * and a human-readable German `label`, so the UI can show *why* something failed
 * instead of a bare "fehlgeschlagen". Covers LLM transport errors as well as the
 * network/parse errors from non-LLM phases; unknown errors fall back to their
 * real message via {@link errorCauseMessage}.
 */
export function describeFailure(err: unknown): { code: string; label: string } {
	if (err instanceof LlmHttpError) {
		if (err.status === 402)
			return { code: 'payment', label: 'Zahlung erforderlich – LLM-Guthaben aufladen' };
		if (err.status === 401 || err.status === 403)
			return { code: 'auth', label: 'Zugriff verweigert – API-Schlüssel prüfen' };
		if (err.status === 429) return { code: 'rate-limit', label: 'Rate-Limit erreicht' };
		if (err.status >= 500) return { code: 'server', label: 'LLM-Serverfehler' };
		return { code: `http-${err.status}`, label: `LLM-Fehler (${err.status})` };
	}
	if ((err instanceof DOMException || err instanceof Error) && err.name === 'TimeoutError')
		return { code: 'timeout', label: 'Zeitlimit überschritten' };
	if (err instanceof Error) {
		if (err.name === 'DraftFormatError')
			return { code: 'draft-format', label: 'E-Mail-Entwurf nicht formatkonform' };
		if (err.name === 'ZodError' || err instanceof SyntaxError || /Kriterium-ID/.test(err.message))
			return { code: 'invalid-response', label: 'Ungültige LLM-Antwort' };
	}
	return { code: 'other', label: errorCauseMessage(err) };
}

/** Tally a failure by its classified cause, mutating `reasons` in place. */
export function bumpFailure(reasons: Map<string, RunPhaseFailureReason>, err: unknown): void {
	const { code, label } = describeFailure(err);
	const existing = reasons.get(code);
	if (existing) existing.count++;
	else reasons.set(code, { code, label, count: 1 });
}

/** Snapshot a failure tally as a plain array, most frequent cause first. */
export function toFailureReasons(
	reasons: Map<string, RunPhaseFailureReason>
): RunPhaseFailureReason[] {
	return [...reasons.values()].sort((a, b) => b.count - a.count).map((reason) => ({ ...reason }));
}
