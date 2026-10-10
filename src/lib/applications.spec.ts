import { describe, expect, it } from 'vitest';
import {
	applicationInputSchema,
	bucketOf,
	daysBetween,
	emptyBucketCounts,
	isReactionStatus,
	responseRate,
	statusChangeSchema,
	todayVienna,
	type ApplicationStatus
} from './applications';

const options = { ghostAfterDays: 21, today: '2026-10-10' };

function bucket(status: ApplicationStatus, appliedOn: string | null) {
	return bucketOf({ status, appliedOn }, options);
}

describe('bucketOf', () => {
	it('puts only real reactions into the highlighted responded bucket', () => {
		for (const status of ['replied', 'interview', 'offer', 'accepted'] as const) {
			expect(bucket(status, '2026-09-01')).toBe('responded');
		}
	});

	it('does not treat "applied" as progress', () => {
		expect(bucket('applied', '2026-10-09')).toBe('waiting');
		expect(bucket('applied', '2026-09-01')).toBe('ghosted');
	});

	it('flips from waiting to ghosted after the threshold, not on it', () => {
		// 21 days ago is still waiting; 22 days ago is ghosted.
		expect(bucket('applied', '2026-09-19')).toBe('waiting');
		expect(bucket('applied', '2026-09-18')).toBe('ghosted');
	});

	it('respects a custom threshold', () => {
		const week = { ghostAfterDays: 7, today: '2026-10-10' };
		expect(bucketOf({ status: 'applied', appliedOn: '2026-10-03' }, week)).toBe('waiting');
		expect(bucketOf({ status: 'applied', appliedOn: '2026-10-02' }, week)).toBe('ghosted');
	});

	it('keeps an applied entry without a date waiting', () => {
		expect(bucket('applied', null)).toBe('waiting');
	});

	it('files rejections and withdrawals as closed and drafts as planned', () => {
		expect(bucket('rejected', '2026-09-01')).toBe('closed');
		expect(bucket('withdrawn', '2026-09-01')).toBe('closed');
		expect(bucket('planned', null)).toBe('planned');
	});
});

describe('isReactionStatus', () => {
	it('counts a rejection as a reaction but not a withdrawal', () => {
		expect(isReactionStatus('rejected')).toBe(true);
		expect(isReactionStatus('replied')).toBe(true);
		expect(isReactionStatus('withdrawn')).toBe(false);
		expect(isReactionStatus('applied')).toBe(false);
		expect(isReactionStatus('planned')).toBe(false);
	});
});

describe('dates', () => {
	it('computes whole day differences across month boundaries', () => {
		expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
		expect(daysBetween('2026-10-02', '2026-09-30')).toBe(-2);
		expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
	});

	it('formats today in Vienna time', () => {
		// 23:30 UTC on 9 Oct is already 10 Oct in Vienna (UTC+2).
		expect(todayVienna(new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-10');
		expect(todayVienna(new Date('2026-10-09T10:00:00Z'))).toBe('2026-10-09');
	});
});

describe('responseRate', () => {
	it('is the share of sent applications that got any reaction', () => {
		expect(responseRate({ sent: 20, reacted: 5 })).toBe(0.25);
		expect(responseRate({ sent: 0, reacted: 0 })).toBeNull();
	});

	it('starts with empty counts for every bucket', () => {
		expect(emptyBucketCounts()).toEqual({
			responded: 0,
			waiting: 0,
			ghosted: 0,
			closed: 0,
			planned: 0
		});
	});
});

describe('schemas', () => {
	it('turns empty form dates into null and fills defaults', () => {
		const parsed = applicationInputSchema.parse({
			companyName: ' Café Central ',
			appliedOn: '',
			nextStepOn: ''
		});
		expect(parsed).toMatchObject({
			companyName: 'Café Central',
			appliedOn: null,
			nextStepOn: null,
			status: 'applied',
			channel: 'email'
		});
	});

	it('rejects a missing company, bad dates and non-http links', () => {
		expect(applicationInputSchema.safeParse({ companyName: '' }).success).toBe(false);
		expect(
			applicationInputSchema.safeParse({ companyName: 'A', appliedOn: '10.10.2026' }).success
		).toBe(false);
		expect(
			applicationInputSchema.safeParse({ companyName: 'A', url: 'javascript:1' }).success
		).toBe(false);
		expect(
			applicationInputSchema.safeParse({ companyName: 'A', url: 'https://example.com/job' }).success
		).toBe(true);
	});

	it('requires a known status for a status change', () => {
		expect(statusChangeSchema.safeParse({ status: 'interview' }).success).toBe(true);
		expect(statusChangeSchema.safeParse({ status: 'ghosted' }).success).toBe(false);
	});
});
