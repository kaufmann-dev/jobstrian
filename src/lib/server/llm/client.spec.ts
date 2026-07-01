import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	chatJson,
	describeLlmFailure,
	errorCauseMessage,
	LlmHttpError,
	parseRetryAfter
} from './client';
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

describe('describeLlmFailure', () => {
	it('maps billing and auth HTTP errors to actionable causes', () => {
		expect(describeLlmFailure(new LlmHttpError(402, 'x'))).toEqual({
			code: 'payment',
			label: 'Zahlung erforderlich – LLM-Guthaben aufladen'
		});
		expect(describeLlmFailure(new LlmHttpError(401, 'x')).code).toBe('auth');
		expect(describeLlmFailure(new LlmHttpError(403, 'x')).code).toBe('auth');
	});

	it('maps transient HTTP errors', () => {
		expect(describeLlmFailure(new LlmHttpError(429, 'x')).code).toBe('rate-limit');
		expect(describeLlmFailure(new LlmHttpError(503, 'x')).code).toBe('server');
	});

	it('labels other HTTP statuses with their code', () => {
		expect(describeLlmFailure(new LlmHttpError(404, 'x'))).toEqual({
			code: 'http-404',
			label: 'LLM-Fehler (404)'
		});
	});

	it('recognizes timeouts, draft-format and invalid responses', () => {
		expect(describeLlmFailure(new DOMException('slow', 'TimeoutError')).code).toBe('timeout');

		const draftErr = new Error('kein Entwurf');
		draftErr.name = 'DraftFormatError';
		expect(describeLlmFailure(draftErr).code).toBe('draft-format');

		const zodErr = new Error('bad');
		zodErr.name = 'ZodError';
		expect(describeLlmFailure(zodErr).code).toBe('invalid-response');
		expect(describeLlmFailure(new SyntaxError('LLM hat keinen Inhalt zurückgegeben.')).code).toBe(
			'invalid-response'
		);
		expect(describeLlmFailure(new Error('Unbekannte Kriterium-ID: foo')).code).toBe(
			'invalid-response'
		);
	});

	it('falls back to the real message for unknown errors', () => {
		expect(describeLlmFailure(new Error('boom'))).toEqual({ code: 'other', label: 'boom' });
	});
});

describe('errorCauseMessage', () => {
	it('leads with the wrapped cause when Drizzle hides the real error', () => {
		const err = new Error('Failed query: insert …');
		(err as { cause?: unknown }).cause = new Error('could not determine data type of parameter $26');
		expect(errorCauseMessage(err)).toBe(
			'could not determine data type of parameter $26 — Failed query: insert …'
		);
	});

	it('stringifies non-Error values', () => {
		expect(errorCauseMessage('nope')).toBe('nope');
	});
});
