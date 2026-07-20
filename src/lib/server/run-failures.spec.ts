import { describe, expect, it } from 'vitest';
import type { RunPhaseFailureReason } from './db/schema';
import { bumpFailure, describeFailure, errorCauseMessage, toFailureReasons } from './run-failures';
import { LlmHttpError } from './llm/client';

describe('describeFailure', () => {
	it('maps billing and auth HTTP errors to actionable causes', () => {
		expect(describeFailure(new LlmHttpError(402, 'x'))).toEqual({
			code: 'payment',
			label: 'Zahlung erforderlich – LLM-Guthaben aufladen'
		});
		expect(describeFailure(new LlmHttpError(401, 'x')).code).toBe('auth');
		expect(describeFailure(new LlmHttpError(403, 'x')).code).toBe('auth');
	});

	it('maps transient HTTP errors', () => {
		expect(describeFailure(new LlmHttpError(429, 'x')).code).toBe('rate-limit');
		expect(describeFailure(new LlmHttpError(503, 'x')).code).toBe('server');
	});

	it('labels other HTTP statuses with their code', () => {
		expect(describeFailure(new LlmHttpError(404, 'x'))).toEqual({
			code: 'http-404',
			label: 'LLM-Fehler (404)'
		});
	});

	it('recognizes timeouts, draft-format and invalid responses', () => {
		expect(describeFailure(new DOMException('slow', 'TimeoutError')).code).toBe('timeout');

		const draftErr = new Error('kein Entwurf');
		draftErr.name = 'DraftFormatError';
		expect(describeFailure(draftErr).code).toBe('draft-format');

		const zodErr = new Error('bad');
		zodErr.name = 'ZodError';
		expect(describeFailure(zodErr).code).toBe('invalid-response');
		expect(describeFailure(new SyntaxError('LLM hat keinen Inhalt zurückgegeben.')).code).toBe(
			'invalid-response'
		);
		expect(describeFailure(new Error('Unbekannte Kriterium-ID: foo')).code).toBe(
			'invalid-response'
		);
	});

	it('falls back to the real message for unknown errors', () => {
		expect(describeFailure(new Error('boom'))).toEqual({ code: 'other', label: 'boom' });
	});
});

describe('errorCauseMessage', () => {
	it('leads with the wrapped cause when Drizzle hides the real error', () => {
		const err = new Error('Failed query: insert …');
		(err as { cause?: unknown }).cause = new Error(
			'could not determine data type of parameter $26'
		);
		expect(errorCauseMessage(err)).toBe(
			'could not determine data type of parameter $26 — Failed query: insert …'
		);
	});

	it('stringifies non-Error values', () => {
		expect(errorCauseMessage('nope')).toBe('nope');
	});
});

describe('bumpFailure / toFailureReasons', () => {
	it('groups by cause and sorts most frequent first', () => {
		const reasons = new Map<string, RunPhaseFailureReason>();
		bumpFailure(reasons, new LlmHttpError(402, 'x'));
		bumpFailure(reasons, new LlmHttpError(402, 'x'));
		bumpFailure(reasons, new LlmHttpError(429, 'x'));

		expect(toFailureReasons(reasons)).toEqual([
			{ code: 'payment', label: 'Zahlung erforderlich – LLM-Guthaben aufladen', count: 2 },
			{ code: 'rate-limit', label: 'Rate-Limit erreicht', count: 1 }
		]);
	});
});
