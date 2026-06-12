import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatJson, parseRetryAfter } from './client';
import { LlmLimiter } from './limiter';

const cfg = { baseUrl: 'https://llm.example.test/v1', apiKey: '', model: 'test' };
const messages = [{ role: 'user' as const, content: 'test' }];

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
			chatJson<{ ok: boolean }>(cfg, messages, { limiter: limiter(), sleep: async () => undefined })
		).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry permanent client errors', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson(cfg, messages, { limiter: limiter(), sleep: async () => undefined })
		).rejects.toThrow('400');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('honors Retry-After and exhausts three total attempts', async () => {
		const sleeps: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('busy', { status: 429, headers: { 'retry-after': '2' } }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson(cfg, messages, {
				limiter: limiter(),
				sleep: async (ms) => {
					sleeps.push(ms);
				}
			})
		).rejects.toThrow('429');
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(sleeps).toEqual([2000, 2000]);
	});

	it('aborts before a retry starts', async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			chatJson(cfg, messages, {
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
