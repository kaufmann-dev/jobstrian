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

	it('paces regular sends by two to four minutes', () => {
		const dates = scheduleApplicationEmails(3, {
			from: new Date('2026-06-29T07:00:00.000Z'),
			random: () => 0.5
		});
		expect(dates.map((date) => date.toISOString())).toEqual([
			'2026-06-29T07:00:00.000Z',
			'2026-06-29T07:03:00.000Z',
			'2026-06-29T07:06:00.000Z'
		]);
	});

	it('adds a larger pause after twenty sends', () => {
		const dates = scheduleApplicationEmails(21, {
			from: new Date('2026-06-29T07:00:00.000Z'),
			random: () => 0
		});
		expect(dates[19].toISOString()).toBe('2026-06-29T07:38:00.000Z');
		expect(dates[20].toISOString()).toBe('2026-06-29T07:50:00.000Z');
	});
});
