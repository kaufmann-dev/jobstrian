import { describe, expect, it } from 'vitest';
import {
	isApplicationEmailSendWindow,
	nextApplicationEmailWindowStart,
	scheduleApplicationEmails
} from './schedule';

describe('application e-mail schedule', () => {
	it('starts before-hours work at 09:00 Europe/Vienna on the same business day', () => {
		const next = nextApplicationEmailWindowStart(new Date('2026-06-29T06:00:00.000Z'));
		expect(next.toISOString()).toBe('2026-06-29T07:00:00.000Z');
	});

	it('moves weekend work to the next Monday morning', () => {
		const next = nextApplicationEmailWindowStart(new Date('2026-06-27T10:00:00.000Z'));
		expect(next.toISOString()).toBe('2026-06-29T07:00:00.000Z');
		expect(isApplicationEmailSendWindow(next)).toBe(true);
	});

	it('paces regular sends by 30 to 90 seconds', () => {
		const dates = scheduleApplicationEmails(3, {
			from: new Date('2026-06-29T07:00:00.000Z'),
			random: () => 0.5
		});
		expect(dates.map((date) => date.toISOString())).toEqual([
			'2026-06-29T07:00:00.000Z',
			'2026-06-29T07:01:00.000Z',
			'2026-06-29T07:02:00.000Z'
		]);
	});

	it('rolls remaining sends to the next business day once the daily limit is reached', () => {
		const dates = scheduleApplicationEmails(3, {
			from: new Date('2026-06-29T07:00:00.000Z'),
			random: () => 0,
			dailyLimit: 2
		});
		expect(dates.map((date) => date.toISOString())).toEqual([
			'2026-06-29T07:00:00.000Z',
			'2026-06-29T07:00:30.000Z',
			'2026-06-30T07:00:00.000Z'
		]);
	});

	it('counts emails already sent today against the first day budget', () => {
		const dates = scheduleApplicationEmails(1, {
			from: new Date('2026-06-29T07:00:00.000Z'),
			random: () => 0,
			dailyLimit: 2,
			alreadySentToday: 2
		});
		expect(dates[0].toISOString()).toBe('2026-06-30T07:00:00.000Z');
	});
});
