import { parseRetryAfter } from '../util/retry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatJson, normalizeUsage } from './client';
import { verificationResponse } from './response-schemas';
import { LlmLimiter } from './limiter';

const cfg = {
	apiType: 'openai-compatible' as const,
	baseUrl: 'https://llm.example.test/v1',
	apiKey: '',
	model: 'test'
};
const messages = [{ role: 'user' as const, content: 'test' }];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function success(content = '{"ok":true}'): Response {
	return Response.json({ choices: [{ message: { content } }] });
}

function limiter(): LlmLimiter {
	return new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 5 });
}

describe('chatJson retries', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('retries malformed responses and succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(success('not json'))
			.mockResolvedValueOnce(success());
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson<{ ok: boolean }>(cfg, messages, {
				response: verificationResponse,
				limiter: limiter(),
				sleep: async () => undefined
			})
		).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry permanent client errors', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson(cfg, messages, {
				response: verificationResponse,
				limiter: limiter(),
				sleep: async () => undefined
			})
		).rejects.toThrow('400');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('honors Retry-After and exhausts three total attempts for interactive work', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const sleeps: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('busy', { status: 429, headers: { 'retry-after': '2' } }));
		vi.stubGlobal('fetch', fetchMock);

		const rejected = expect(
			chatJson(cfg, messages, {
				response: verificationResponse,
				limiter: limiter(),
				sleep: async (ms) => {
					sleeps.push(ms);
				}
			})
		).rejects.toThrow('429');
		await vi.advanceTimersByTimeAsync(180_000);
		await rejected;
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(sleeps).toEqual([2000, 2000]);
	});

	it('aborts before a retry starts', async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson(cfg, messages, {
				response: verificationResponse,
				limiter: limiter(),
				signal: controller.signal,
				sleep: async () => {
					controller.abort(new DOMException('Canceled', 'AbortError'));
				}
			})
		).rejects.toThrow('Canceled');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('parseRetryAfter', () => {
	it('parses seconds and HTTP dates', () => {
		expect(parseRetryAfter('3', 0)).toBe(3000);
		expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 1000)).toBe(4000);
	});
});

describe('native providers', () => {
	function nativeSuccess(apiType: 'openai' | 'anthropic', text = '{"ok":true}') {
		return apiType === 'openai'
			? {
					status: 'completed',
					output: [{ type: 'message', content: [{ type: 'output_text', text }] }]
				}
			: { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
	}

	it.each(['openai', 'anthropic'] as const)(
		'uses %s authentication, native schema and output parsing',
		async (apiType) => {
			const fetchMock = vi.fn().mockResolvedValue(Response.json(nativeSuccess(apiType)));
			vi.stubGlobal('fetch', fetchMock);
			await expect(
				chatJson({ ...cfg, apiType, apiKey: 'test-key' }, messages, {
					limiter: limiter(),
					response: verificationResponse,
					context: 'Applicant profile',
					temperature: 0,
					maxOutputTokens: 1024
				})
			).resolves.toEqual({ ok: true });
			const [url, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(url).toBe(cfg.baseUrl + (apiType === 'openai' ? '/responses' : '/messages'));
			expect(body.temperature).toBeUndefined();
			if (apiType === 'openai') {
				expect(init.headers.authorization).toBe('Bearer test-key');
				expect(body.store).toBe(false);
				expect(body.max_output_tokens).toBe(1024);
				expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
				expect(body.input[1].content.map((b: { text: string }) => b.text)).toEqual([
					'Applicant profile',
					'test'
				]);
			} else {
				expect(init.headers).toMatchObject({
					'x-api-key': 'test-key',
					'anthropic-version': '2023-06-01'
				});
				expect(init.headers.authorization).toBeUndefined();
				expect(body.max_tokens).toBe(1024);
				expect(body.output_config.format.type).toBe('json_schema');
				expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '5m' });
				expect(body.messages[0].content[1].cache_control).toBeUndefined();
			}
		}
	);

	it.each(['openai', 'anthropic', 'openai-compatible'] as const)(
		'sends the %s reasoning level with a raised output budget',
		async (apiType) => {
			const fetchMock = vi.fn<typeof fetch>(async () =>
				apiType === 'openai-compatible' ? success() : Response.json(nativeSuccess(apiType))
			);
			vi.stubGlobal('fetch', fetchMock);
			await chatJson({ ...cfg, apiType, reasoningEffort: 'high' }, messages, {
				limiter: limiter(),
				response: verificationResponse,
				temperature: 0,
				maxOutputTokens: 1024
			});
			const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
			if (apiType === 'openai') {
				expect(body.reasoning).toEqual({ effort: 'high' });
				expect(body.max_output_tokens).toBe(16_384);
			} else if (apiType === 'anthropic') {
				expect(body.thinking).toEqual({ type: 'adaptive' });
				expect(body.output_config).toMatchObject({
					effort: 'high',
					format: { type: 'json_schema' }
				});
				expect(body.max_tokens).toBe(16_384);
			} else {
				expect(body.reasoning_effort).toBe('high');
				expect(body.temperature).toBeUndefined();
				expect(body.max_tokens).toBe(16_384);
			}
		}
	);

	it.each(['openai', 'anthropic', 'openai-compatible'] as const)(
		'sends no %s reasoning fields without a level',
		async (apiType) => {
			const fetchMock = vi.fn<typeof fetch>(async () =>
				apiType === 'openai-compatible' ? success() : Response.json(nativeSuccess(apiType))
			);
			vi.stubGlobal('fetch', fetchMock);
			await chatJson({ ...cfg, apiType, reasoningEffort: null }, messages, {
				limiter: limiter(),
				response: verificationResponse
			});
			const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
			expect(body.reasoning).toBeUndefined();
			expect(body.thinking).toBeUndefined();
			expect(body.reasoning_effort).toBeUndefined();
			expect(body.output_config?.effort).toBeUndefined();
		}
	);

	it('waits longer before timing out a reasoning request', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
							once: true
						});
					})
			)
		);
		let settled = false;
		const pending = chatJson({ ...cfg, reasoningEffort: 'low' }, messages, {
			limiter: limiter(),
			response: verificationResponse,
			maxAttempts: 1
		}).finally(() => {
			settled = true;
		});
		const outcome = expect(pending).rejects.toThrow('Zeitlimit');
		await vi.advanceTimersByTimeAsync(60_001);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(120_000);
		await outcome;
	});

	it('does not request Claude caching for one-off requests', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json(nativeSuccess('anthropic')));
		vi.stubGlobal('fetch', fetchMock);
		await chatJson({ ...cfg, apiType: 'anthropic' }, messages, {
			limiter: limiter(),
			response: verificationResponse
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toEqual([
			{ type: 'text', text: 'test' }
		]);
	});

	it.each([
		[
			'openai',
			{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }
		],
		['openai', { status: 'incomplete', output: [] }],
		['anthropic', { stop_reason: 'refusal', content: [] }],
		['anthropic', { stop_reason: 'max_tokens', content: [] }]
	] as const)('does not retry %s refusal/incomplete output', async (apiType, data) => {
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(data)));
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			chatJson({ ...cfg, apiType }, messages, {
				limiter: limiter(),
				response: verificationResponse,
				sleep: async () => undefined
			})
		).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('validates the schema rather than trusting the requested TypeScript type', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() =>
				Promise.resolve(Response.json(nativeSuccess('openai', '{"ok":false}')))
			);
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			chatJson({ ...cfg, apiType: 'openai' }, messages, {
				limiter: limiter(),
				response: verificationResponse,
				sleep: async () => undefined
			})
		).rejects.toThrow('Schema');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('logs provider usage before rejecting malformed output without logging the content or key', async () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					...nativeSuccess('anthropic', 'private-invalid-output'),
					usage: {
						input_tokens: 10,
						cache_read_input_tokens: 100,
						cache_creation_input_tokens: 20,
						output_tokens: 5
					}
				})
			)
		);
		await expect(
			chatJson(
				{ ...cfg, apiType: 'anthropic', apiKey: 'private-key', personId: 7, connectionId: 2 },
				messages,
				{
					limiter: limiter(),
					response: verificationResponse,
					maxAttempts: 1
				}
			)
		).rejects.toThrow();
		const entry = JSON.parse(log.mock.calls[0][1]);
		expect(entry).toMatchObject({
			personId: 7,
			connectionId: 2,
			inputTokens: 130,
			cachedInputTokens: 100,
			cacheWriteTokens: 20,
			outputTokens: 5
		});
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-key|private-invalid-output/);
	});

	it('times out an in-flight request and releases the limiter slot', async () => {
		const shared = limiter();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(
				(_url, init) =>
					new Promise((_resolve, reject) => {
						init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
					})
			)
		);
		await expect(
			chatJson(cfg, messages, {
				limiter: shared,
				response: verificationResponse,
				timeoutMs: 5,
				maxAttempts: 1
			})
		).rejects.toThrow('Zeitlimit');
		expect(shared.metrics().inFlight).toBe(0);
	});
});

describe('normalized usage', () => {
	it('uses OpenAI total input without adding cached/write tokens again', () => {
		expect(
			normalizeUsage('openai', {
				input_tokens: 100,
				output_tokens: 8,
				input_tokens_details: { cached_tokens: 60, cache_write_tokens: 20 }
			})
		).toEqual({
			inputTokens: 100,
			outputTokens: 8,
			cachedInputTokens: 60,
			cacheWriteTokens: 20
		});
	});
	it('records absent usage as unknown and reads compatible usage', () => {
		expect(normalizeUsage('anthropic')).toEqual({
			inputTokens: null,
			outputTokens: null,
			cachedInputTokens: null,
			cacheWriteTokens: null
		});
		expect(
			normalizeUsage('openai-compatible', {
				prompt_tokens: 20,
				completion_tokens: 4,
				prompt_tokens_details: { cached_tokens: 5 }
			})
		).toEqual({ inputTokens: 20, outputTokens: 4, cachedInputTokens: 5, cacheWriteTokens: null });
	});
});

describe('refresh capacity recovery', () => {
	it('survives more than three throttled requests and completes the same task', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		let calls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				++calls <= 5
					? Response.json(
							{ error: { type: 'rate_limit_error' } },
							{ status: 429, headers: { 'retry-after': '1' } }
						)
					: success()
			)
		);
		const shared = new LlmLimiter({ requestsPerMinute: 1000, maxConcurrent: 8, random: () => 0 });
		const pending = chatJson(cfg, messages, {
			limiter: shared,
			response: verificationResponse,
			deferRateLimits: true
		});
		await vi.advanceTimersByTimeAsync(60_000);
		await expect(pending).resolves.toEqual({ ok: true });
		expect(calls).toBe(6);
		expect(shared.metrics()).toMatchObject({
			rateLimitEvents: 5,
			recovering: false,
			cooldownUntil: null,
			queued: 0,
			inFlight: 0
		});
	});
	it('does not defer quota errors or poison connection limits', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 })
		);
		vi.stubGlobal('fetch', fetchMock);
		const shared = limiter();
		await expect(
			chatJson(cfg, messages, {
				limiter: shared,
				response: verificationResponse,
				deferRateLimits: true
			})
		).rejects.toThrow('Kontingent');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(shared.metrics()).toMatchObject({
			rateLimitEvents: 0,
			cooldownUntil: null,
			effectiveRequestsPerMinute: 100
		});
	});
	it('includes semantic validation in the same three-attempt budget', async () => {
		const fetchMock = vi.fn(async () => success());
		vi.stubGlobal('fetch', fetchMock);
		let parsed = 0;
		await expect(
			chatJson(cfg, messages, {
				limiter: limiter(),
				response: verificationResponse,
				sleep: async () => {},
				parse: () => {
					if (++parsed < 3) throw new SyntaxError('fehlende Kriterien');
					return 'valid';
				}
			})
		).resolves.toBe('valid');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
