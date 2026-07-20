export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const SESSION_TOUCH_PATH = '/auth/session/touch';
export const SESSION_TOUCH_HEADER = 'x-jobstrian-user-interaction';

interface SessionTimes {
	createdAt: Date;
	lastActiveAt: Date | null;
}

export function isSessionExpired(session: SessionTimes, now = new Date()): boolean {
	const lastActivity = session.lastActiveAt ?? session.createdAt;
	return (
		now.getTime() - lastActivity.getTime() >= SESSION_IDLE_TIMEOUT_MS ||
		now.getTime() - session.createdAt.getTime() >= SESSION_ABSOLUTE_TIMEOUT_MS
	);
}

export function shouldTouchSession(
	request: Request,
	pathname: string,
	expectedOrigin: string
): boolean {
	return (
		pathname === SESSION_TOUCH_PATH &&
		request.method === 'POST' &&
		request.headers.get(SESSION_TOUCH_HEADER) === '1' &&
		request.headers.get('origin') === expectedOrigin &&
		request.headers.get('sec-fetch-site') === 'same-origin'
	);
}

export function sessionNeedsTouch(lastActiveAt: Date, now = new Date()): boolean {
	return now.getTime() - lastActiveAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
