import { describe, expect, it } from 'vitest';
import { createRunProgress } from './run-progress';
import { formatLlmProgress } from './llm-progress';

describe('LLM progress display', () => {
	it('shows active work and effective limits against configured ceilings', () => {
		const metrics = {
			...createRunProgress().llm,
			inFlight: 2,
			queued: 8,
			requestsPerMinute: 120,
			maxConcurrent: 10,
			effectiveRequestsPerMinute: 60,
			effectiveMaxConcurrent: 5
		};

		expect(formatLlmProgress(metrics)).toBe(
			'KI: 2 aktiv, 8 warten · aktuell 60/120 Anfragen/min, 5/10 parallel'
		);
	});

	it('shows a provider pause in Vienna time and replaces it on cautious recovery', () => {
		const metrics = {
			...createRunProgress().llm,
			cooldownUntil: Date.parse('2026-10-11T12:34:56Z'),
			recovering: true,
			rateLimitEvents: 2
		};

		const paused = formatLlmProgress(metrics);
		expect(paused).toContain('KI pausiert bis 14:34:56');
		expect(paused).not.toContain('vorsichtig');
		expect(paused).not.toContain('fehlgeschlagen');

		const recovering = formatLlmProgress({ ...metrics, cooldownUntil: null });
		expect(recovering).toContain('KI wird vorsichtig fortgesetzt');
		expect(recovering).not.toContain('pausiert');

		const recovered = formatLlmProgress({ ...metrics, cooldownUntil: null, recovering: false });
		expect(recovered).not.toContain('vorsichtig');
		expect(recovered).not.toContain('pausiert');
		expect(recovered).not.toContain('fehlgeschlagen');
	});
});
