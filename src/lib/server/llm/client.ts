import type { Settings } from '../db/schema';
import { getSettings } from '../settings';
import { abortError, isAbortError, LlmLimiter } from './limiter';

export interface LlmConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export class LlmNotConfiguredError extends Error {
	constructor() {
		super('LLM ist nicht konfiguriert. Base URL oder Modell fehlen in den Einstellungen.');
		this.name = 'LlmNotConfiguredError';
	}
}

export async function getLlmConfig(settings?: Settings): Promise<LlmConfig> {
	const s = settings ?? (await getSettings());
	if (!s.llmBaseUrl || !s.llmModel) throw new LlmNotConfiguredError();
	return { baseUrl: s.llmBaseUrl, apiKey: s.llmApiKey, model: s.llmModel };
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
	if (isAbortError(error)) return false;
	if (error instanceof LlmHttpError) {
		return RETRYABLE_STATUSES.has(error.status) || error.status >= 500;
	}
	return error instanceof TypeError || error instanceof SyntaxError || error instanceof Error;
}

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

export interface LlmFailureInfo {
	code: string;
	label: string;
}

/**
 * Classify a per-item failure into a stable `code` (for grouping/counting) and a
 * human-readable German `label`, so the UI can show *why* something failed
 * instead of a bare "fehlgeschlagen". Unknown errors fall back to their real
 * message via {@link errorCauseMessage}.
 */
export function describeLlmFailure(err: unknown): LlmFailureInfo {
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

function endpoint(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

/** Strip ```json fences some models wrap around their output. */
function unfence(text: string): string {
	const trimmed = text.trim();
	const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return (fence ? fence[1] : trimmed).trim();
}

/**
 * Call an OpenAI-compatible chat-completions endpoint and parse the assistant
 * message as JSON (response_format json_object). Throws on transport/parse error.
 */
export async function chatJson<T>(
	cfg: LlmConfig,
	messages: { role: 'system' | 'user'; content: string }[],
	opts: {
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
	const sleep = opts.sleep ?? delay;
	const random = opts.random ?? Math.random;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		if (opts.signal?.aborted) throw opts.signal.reason ?? abortError();
		try {
			return await opts.limiter.run(async (limiterSignal) => {
				const request = attemptSignal(limiterSignal, opts.timeoutMs);
				try {
					const res = await fetch(endpoint(cfg.baseUrl), {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {})
						},
						body: JSON.stringify({
							model: cfg.model,
							temperature: opts.temperature ?? 0.2,
							response_format: { type: 'json_object' },
							messages
						}),
						signal: request.signal
					});
					if (!res.ok) {
						throw new LlmHttpError(
							res.status,
							`LLM-Anfrage fehlgeschlagen (${res.status}).`,
							parseRetryAfter(res.headers.get('retry-after'))
						);
					}
					const data = (await res.json()) as {
						choices?: { message?: { content?: string } }[];
					};
					const content = data.choices?.[0]?.message?.content;
					if (!content) throw new SyntaxError('LLM hat keinen Inhalt zurückgegeben.');
					return JSON.parse(unfence(content)) as T;
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
