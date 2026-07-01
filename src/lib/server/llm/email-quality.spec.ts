import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmLimiter } from './limiter';

const { chatJson } = vi.hoisted(() => ({
	chatJson: vi.fn()
}));

vi.mock('./client', () => ({
	chatJson
}));

import {
	EMAIL_QUALITY_BATCH_SIZE,
	EMAIL_QUALITY_SYSTEM_PROMPT,
	deterministicLeadEmailReview,
	reviewLeadEmailCandidates,
	type LeadEmailQualityCandidate
} from './email-quality';

const cfg = { baseUrl: 'https://llm.example.test/v1', apiKey: '', model: 'test' };

function limiter(): LlmLimiter {
	return new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 5 });
}

function candidate(id: number, email = `kontakt-${id}@betrieb.example`): LeadEmailQualityCandidate {
	return {
		id,
		name: `Betrieb ${id}`,
		category: 'cafe',
		website: 'https://betrieb.example',
		email,
		emailSource: 'website'
	};
}

describe('deterministicLeadEmailReview', () => {
	it('rejects the Wix/Sentry technical address from scraped pages', () => {
		expect(
			deterministicLeadEmailReview('605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com')
		).toMatchObject({ status: 'rejected' });
	});

	it('keeps normal generic business contacts for the LLM pass', () => {
		expect(deterministicLeadEmailReview('office@betrieb.example')).toBeNull();
		expect(deterministicLeadEmailReview('info@betrieb.example')).toBeNull();
		expect(deterministicLeadEmailReview('kontakt@betrieb.example')).toBeNull();
		expect(deterministicLeadEmailReview('mail@betrieb.example')).toBeNull();
	});

	it('does not reject long natural alphanumeric local parts as random tokens', () => {
		expect(deterministicLeadEmailReview('karriereservice2026teamgraz@betrieb.example')).toBeNull();
	});
});

describe('reviewLeadEmailCandidates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not call the LLM for deterministic rejections', async () => {
		const results = await reviewLeadEmailCandidates(
			cfg,
			[candidate(1, 'noreply@betrieb.example')],
			limiter()
		);

		expect(results).toMatchObject([{ id: 1, status: 'rejected' }]);
		expect(chatJson).not.toHaveBeenCalled();
	});

	it('batches LLM reviews at the configured batch size', async () => {
		chatJson.mockResolvedValue({ decisions: [] });
		const candidates = Array.from({ length: EMAIL_QUALITY_BATCH_SIZE + 1 }, (_, index) =>
			candidate(index + 1)
		);

		const results = await reviewLeadEmailCandidates(cfg, candidates, limiter());

		expect(chatJson).toHaveBeenCalledTimes(2);
		expect(results).toHaveLength(EMAIL_QUALITY_BATCH_SIZE + 1);
		expect(results.every((result) => result.status === 'accepted')).toBe(true);
	});

	it('tells cheap models that zero rejections are valid and safer than false rejection', async () => {
		chatJson.mockResolvedValue({ decisions: [] });

		await reviewLeadEmailCandidates(cfg, [candidate(1, 'office@betrieb.example')], limiter());

		const messages = chatJson.mock.calls[0][1] as { role: string; content: string }[];
		expect(messages[0].content).toBe(EMAIL_QUALITY_SYSTEM_PROMPT);
		expect(messages[0].content).toContain('Null Ablehnungen');
		expect(messages[0].content).toContain('erfolgreiches Ergebnis');
		expect(messages[0].content).toContain('faelschlich abzulehnen ist schlimmer');
	});

	it('uses LLM decisions by candidate id', async () => {
		chatJson.mockResolvedValue({
			decisions: [
				{ id: '1', status: 'accepted', reason: 'allgemeiner Kontakt' },
				{ id: '2', status: 'rejected', reason: 'nur Newsletter' }
			]
		});

		const results = await reviewLeadEmailCandidates(
			cfg,
			[candidate(1, 'office@betrieb.example'), candidate(2, 'promo@betrieb.example')],
			limiter()
		);

		expect(results).toMatchObject([
			{ id: 1, status: 'accepted', reason: 'allgemeiner Kontakt' },
			{ id: 2, status: 'rejected', reason: 'nur Newsletter' }
		]);
	});

	it('overrides LLM rejections for protected generic business contacts', async () => {
		chatJson.mockResolvedValue({
			decisions: [{ id: '1', status: 'rejected', reason: 'zu allgemein' }]
		});

		const results = await reviewLeadEmailCandidates(
			cfg,
			[candidate(1, 'mail@betrieb.example')],
			limiter()
		);

		expect(results).toMatchObject([
			{ id: 1, status: 'accepted', reason: 'geschuetzte plausible Geschaeftsadresse' }
		]);
	});

	it('reports progress after deterministic review and each LLM batch', async () => {
		chatJson.mockResolvedValue({ decisions: [{ id: '2', status: 'accepted', reason: 'ok' }] });
		const progress: unknown[] = [];

		await reviewLeadEmailCandidates(
			cfg,
			[candidate(1, 'noreply@betrieb.example'), candidate(2, 'office@betrieb.example')],
			limiter(),
			undefined,
			(update) => {
				progress.push(update);
			}
		);

		expect(progress).toEqual([
			{ reviewed: 1, total: 2, accepted: 0, rejected: 1, failedBatches: 0, failureReasons: [] },
			{ reviewed: 2, total: 2, accepted: 1, rejected: 1, failedBatches: 0, failureReasons: [] }
		]);
	});
});
