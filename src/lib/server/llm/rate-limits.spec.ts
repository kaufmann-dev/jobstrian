import { describe, expect, it } from 'vitest';
import { providerAccessBlocked, rateLimitHints, resetDuration } from './rate-limits';

describe('provider feedback', () => {
	it('parses request and project token resets without pausing for available budgets', () => {
		expect(
			rateLimitHints(
				new Headers({
					'x-ratelimit-limit-requests': '60',
					'x-ratelimit-remaining-requests': '5',
					'x-ratelimit-reset-requests': '1h',
					'x-ratelimit-remaining-project-tokens': '0',
					'x-ratelimit-reset-project-tokens': '1m2.5s',
					'retry-after': '3'
				}),
				'openai',
				1000
			)
		).toEqual({ requestLimit: 60, retryAfterMs: 3000, exhaustedUntil: 63_500 });
		expect(resetDuration('2m500ms')).toBe(120_500);
		expect(resetDuration('broken')).toBeUndefined();
	});
	it('parses Claude input/output token reset timestamps and ignores malformed headers', () => {
		expect(
			rateLimitHints(
				new Headers({
					'anthropic-ratelimit-requests-limit': 'invalid',
					'anthropic-ratelimit-input-tokens-remaining': '0',
					'anthropic-ratelimit-input-tokens-reset': '1970-01-01T00:02:00Z',
					'anthropic-ratelimit-output-tokens-remaining': '0',
					'anthropic-ratelimit-output-tokens-reset': 'invalid'
				}),
				'anthropic',
				1000
			)
		).toEqual({ requestLimit: undefined, retryAfterMs: undefined, exhaustedUntil: 120_000 });
	});
	it('distinguishes quota and spend failures from temporary throttling', () => {
		expect(providerAccessBlocked({ error: { code: 'credit_balance_exhausted' } })).toBe(true);
		expect(providerAccessBlocked({ error: { type: 'insufficient_quota' } })).toBe(true);
		expect(
			providerAccessBlocked({
				error: { type: 'rate_limit_error', details: { error_code: 'enforced_spend_limit_reached' } }
			})
		).toBe(true);
		expect(providerAccessBlocked({ error: { type: 'rate_limit_error', code: 'slow_down' } })).toBe(
			false
		);
	});
});
