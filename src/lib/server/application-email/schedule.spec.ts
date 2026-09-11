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
	it.each(['2026-06-27T10:00:00.000Z', '2026-06-28T10:00:00.000Z'])(
		'allows a weekend send when enabled: %s',
		(iso) => {
			const date = new Date(iso);
			expect(nextApplicationEmailWindowStart(date, true)).toEqual(date);
			expect(isApplicationEmailSendWindow(date, true)).toBe(true);
			expect(isApplicationEmailSendWindow(date, false)).toBe(false);
		}
	);

	it.each([
		['2026-06-27T06:00:00.000Z', '2026-06-27T07:00:00.000Z'],
		['2026-06-26T16:00:00.000Z', '2026-06-27T07:00:00.000Z'],
		['2026-03-28T17:00:00.000Z', '2026-03-29T07:00:00.000Z'],
		['2026-10-24T16:00:00.000Z', '2026-10-25T08:00:00.000Z']
	])('preserves Vienna hours across weekend and DST boundaries: %s', (from, expected) => {
		expect(nextApplicationEmailWindowStart(new Date(from), true).toISOString()).toBe(expected);
		expect(isApplicationEmailSendWindow(new Date(from), true)).toBe(false);
	});

	it.each([false, true])(
		'rolls Friday overflow to the next allowed day (weekends: %s)',
		(sendOnWeekends) => {
			const dates = scheduleApplicationEmails(2, {
				from: new Date('2026-06-26T15:59:30.000Z'),
				random: () => 0,
				sendOnWeekends
			});
			expect(dates.map((date) => date.toISOString())).toEqual([
				'2026-06-26T15:59:30.000Z',
				sendOnWeekends ? '2026-06-27T07:00:00.000Z' : '2026-06-29T07:00:00.000Z'
			]);
		}
	);

	it('keeps the daily limit and already-sent budget on weekends', () => {
		const dates = scheduleApplicationEmails(2, {
			from: new Date('2026-06-27T10:00:00.000Z'),
			random: () => 0,
			dailyLimit: 2,
			alreadySentToday: 1,
			sendOnWeekends: true
		});
		expect(dates.map((date) => date.toISOString())).toEqual([
			'2026-06-27T10:00:00.000Z',
			'2026-06-28T07:00:00.000Z'
		]);
	});

	it('does not treat weekday public holidays differently', () => {
		const date = new Date('2026-12-25T09:00:00.000Z');
		expect(nextApplicationEmailWindowStart(date, false)).toEqual(date);
	});
});
