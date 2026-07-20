import { describe, expect, it } from 'vitest';
import {
	SESSION_ABSOLUTE_TIMEOUT_MS,
	SESSION_IDLE_TIMEOUT_MS,
	SESSION_TOUCH_HEADER,
	SESSION_TOUCH_INTERVAL_MS,
	SESSION_TOUCH_PATH,
	isSessionExpired,
	sessionNeedsTouch,
	shouldTouchSession
} from './session-policy';

const now = new Date('2026-07-20T12:00:00.000Z');
const expectedOrigin = 'https://app.example.com';

describe('local session policy', () => {
	it('expires at the 24-hour idle or seven-day absolute boundary', () => {
		expect(
			isSessionExpired(
				{
					createdAt: new Date(now.getTime() - SESSION_ABSOLUTE_TIMEOUT_MS + 1),
					lastActiveAt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS + 1)
				},
				now
			)
		).toBe(false);
		expect(
			isSessionExpired(
				{
					createdAt: new Date(now.getTime() - SESSION_ABSOLUTE_TIMEOUT_MS),
					lastActiveAt: now
				},
				now
			)
		).toBe(true);
		expect(
			isSessionExpired(
				{
					createdAt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS),
					lastActiveAt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS)
				},
				now
			)
		).toBe(true);
	});

	it('touches only the explicit same-origin interaction endpoint', () => {
		expect(
			shouldTouchSession(
				new Request(`https://app.example.com${SESSION_TOUCH_PATH}`, {
					method: 'POST',
					headers: {
						[SESSION_TOUCH_HEADER]: '1',
						origin: 'https://app.example.com',
						'sec-fetch-site': 'same-origin'
					}
				}),
				SESSION_TOUCH_PATH,
				expectedOrigin
			)
		).toBe(true);
		expect(
			shouldTouchSession(
				new Request('https://app.example.com/api/runs/progress', {
					headers: { accept: 'application/json' }
				}),
				'/api/runs/progress',
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				new Request('https://app.example.com/jobs', {
					headers: {
						accept: 'text/html',
						'sec-fetch-dest': 'document',
						'sec-fetch-user': '?1'
					}
				}),
				'/jobs',
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				new Request('https://app.example.com/jobs', {
					headers: { accept: 'text/html', 'sec-fetch-dest': 'document' }
				}),
				'/jobs',
				expectedOrigin
			)
		).toBe(false);
	});

	it('rejects forged or incomplete interaction requests', () => {
		const request = (headers: Record<string, string>) =>
			new Request(`https://app.example.com${SESSION_TOUCH_PATH}`, {
				method: 'POST',
				headers: { [SESSION_TOUCH_HEADER]: '1', ...headers }
			});

		expect(
			shouldTouchSession(
				request({ origin: 'https://attacker.example.com', 'sec-fetch-site': 'cross-site' }),
				SESSION_TOUCH_PATH,
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				request({ origin: 'https://app.example.com' }),
				SESSION_TOUCH_PATH,
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				request({ 'sec-fetch-site': 'same-origin' }),
				SESSION_TOUCH_PATH,
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				new Request(`https://attacker.example.com${SESSION_TOUCH_PATH}`, {
					method: 'POST',
					headers: {
						[SESSION_TOUCH_HEADER]: '1',
						origin: 'https://attacker.example.com',
						'sec-fetch-site': 'same-origin'
					}
				}),
				SESSION_TOUCH_PATH,
				expectedOrigin
			)
		).toBe(false);
		expect(
			shouldTouchSession(
				new Request('https://app.example.com/not-the-touch-route', {
					method: 'POST',
					headers: {
						[SESSION_TOUCH_HEADER]: '1',
						origin: 'https://app.example.com',
						'sec-fetch-site': 'same-origin'
					}
				}),
				'/not-the-touch-route',
				expectedOrigin
			)
		).toBe(false);
	});

	it('rate-limits session writes', () => {
		expect(sessionNeedsTouch(new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS + 1), now)).toBe(
			false
		);
		expect(sessionNeedsTouch(new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS), now)).toBe(true);
	});
});
