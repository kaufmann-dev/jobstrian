import type { LlmApiType, LlmReasoningEffort } from '#lib/llm.js';
import { responseJsonSchema, type LlmResponseSchema } from './response-schemas';
import { type LlmLimiter } from './limiter';
import { HttpError, withRetry, isTransientError, type RetryContext } from '../util/retry';
import { rateLimitHints, providerAccessBlocked } from './rate-limits';

/** What a chat request needs to reach a model. */
export interface LlmEndpoint {
	apiType: LlmApiType;
	personId?: number;
	connectionId?: number;
	modelRowId?: number;
	baseUrl: string;
	apiKey: string;
	model: string;
	/** Requested reasoning level; null or absent sends nothing. */
	reasoningEffort?: LlmReasoningEffort | null;
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

export class LlmHttpError extends HttpError {
	constructor(
		status: number,
		message: string,
		retryAfterMs?: number,
		readonly accessBlocked = false
	) {
		super(status, message, retryAfterMs);
		this.name = 'LlmHttpError';
	}
}

export function isRetryableLlmError(error: unknown): boolean {
	if (error instanceof LlmResponseError) return error.retryable;
	if (error instanceof LlmHttpError)
		return !error.accessBlocked && (error.status === 409 || isTransientError(error));
	return isTransientError(error);
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
	constructor(
		message: string,
		readonly retryable = false
	) {
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
	opts: RetryContext & {
		parse?: (value: unknown) => T;
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
	const system = messages
		.filter((m) => m.role === 'system')
		.map((m) => m.content)
		.join('\n');
	const input = messages
		.filter((m) => m.role === 'user')
		.map((m) => m.content)
		.join('\n');
	const effort = cfg.reasoningEffort ?? null;
	// Reasoning tokens count against the output budget and take longer to produce.
	const maxTokens = effort
		? Math.max(opts.maxOutputTokens ?? 8192, 16_384)
		: (opts.maxOutputTokens ?? 8192);
	const timeoutMs = opts.timeoutMs ?? (effort ? 180_000 : 60_000);
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
					...(effort ? { reasoning: { effort } } : {}),
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
						...(effort ? { thinking: { type: 'adaptive' } } : {}),
						messages: [{ role: 'user', content: userBlocks }],
						output_config: {
							format: { type: 'json_schema', schema },
							...(effort ? { effort } : {})
						}
					}
				: {
						model: cfg.model,
						// Reasoning models reject a custom temperature.
						...(effort ? { reasoning_effort: effort } : { temperature: opts.temperature ?? 0.2 }),
						max_tokens: maxTokens,
						response_format: { type: 'json_object' },
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: [opts.context, input].filter(Boolean).join('\n\n') }
						]
					};
	return withRetry(
		async (attempt) => {
			return opts.limiter.run(async (limiterSignal, feedback) => {
				const request = attemptSignal(limiterSignal, timeoutMs);
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
							reasoningEffort: effort,
							personId: cfg.personId ?? null,
							purpose: opts.response.name,
							attempt,
							status: res.status,
							durationMs: Date.now() - started,
							...normalizeUsage(cfg.apiType, data?.usage)
						})
					);
					const hints = rateLimitHints(res.headers, cfg.apiType);
					const blocked = providerAccessBlocked(data);
					feedback.response(res.status, hints, blocked);
					if (!res.ok) {
						throw new LlmHttpError(
							res.status,
							`${blocked ? 'KI-Zugang gesperrt: Guthaben oder Kontingent prüfen.' : `LLM-Anfrage fehlgeschlagen (${res.status}).`}${res.status === 400 ? ' Prüfe Modell und Unterstützung für strukturierte Ausgaben.' : res.status === 404 ? ' Prüfe Modell und API-Endpunkt.' : ''}`,
							hints.retryAfterMs,
							blocked
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
						throw new LlmResponseError(
							'Die KI-Antwort entspricht nicht dem erwarteten Schema.',
							true
						);
					if (opts.parse) {
						try {
							return opts.parse(parsed.data);
						} catch (error) {
							if (error instanceof LlmResponseError) throw error;
							throw new LlmResponseError(
								error instanceof Error ? error.message : 'Ungültige KI-Antwort.',
								true
							);
						}
					}
					return parsed.data as T;
				} finally {
					request.cleanup();
				}
			}, opts.signal);
		},
		{
			signal: opts.signal,
			maxAttempts: opts.maxAttempts,
			onRetry: opts.onRetry,
			sleep: opts.sleep,
			random: opts.random,
			classify: (error) => {
				if (
					error instanceof LlmHttpError &&
					error.status === 429 &&
					!error.accessBlocked &&
					opts.deferRateLimits
				)
					return 'defer';
				return isRetryableLlmError(error) ? 'retry' : 'stop';
			}
		}
	);
}
