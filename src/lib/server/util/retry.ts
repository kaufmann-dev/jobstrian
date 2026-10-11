export type RetryDisposition = 'retry' | 'defer' | 'stop';
export interface RetryStatus {
	state: 'attempt' | 'waiting' | 'finished';
	attempt: number;
	delayMs: number;
}
export type RetryObserver = (status: RetryStatus) => void | Promise<void>;
export interface RetryContext {
	onRetry?: RetryObserver;
	deferRateLimits?: boolean;
}

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly retryAfterMs?: number
	) {
		super(message);
		this.name = 'HttpError';
	}
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
	if (!value?.trim()) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function isAborted(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

export function isTransientError(error: unknown): boolean {
	if (isAborted(error)) return false;
	if (error instanceof HttpError)
		return [408, 425, 429].includes(error.status) || error.status >= 500;
	return (
		error instanceof TypeError ||
		error instanceof SyntaxError ||
		(error instanceof Error && error.name === 'TimeoutError')
	);
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(signal.reason);
	return new Promise((resolve, reject) => {
		const until = Date.now() + ms;
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			timer = setTimeout(
				() => {
					if (Date.now() < until) schedule();
					else {
						signal?.removeEventListener('abort', onAbort);
						resolve();
					}
				},
				Math.min(Math.max(0, until - Date.now()), 2_147_483_647)
			);
		};
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			reject(signal?.reason ?? new DOMException('Abgebrochen', 'AbortError'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		schedule();
	});
}

export async function withRetry<T>(
	operation: (attempt: number) => Promise<T>,
	options: {
		signal?: AbortSignal;
		maxAttempts?: number;
		onRetry?: RetryObserver;
		classify?: (error: unknown) => RetryDisposition;
		sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
		random?: () => number;
	} = {}
): Promise<T> {
	const sleep = options.sleep ?? abortableSleep;
	const random = options.random ?? Math.random;
	let attempt = 0;
	let failures = 0;
	try {
		while (true) {
			if (options.signal?.aborted) throw options.signal.reason;
			attempt++;
			await options.onRetry?.({ state: 'attempt', attempt, delayMs: 0 });
			if (options.signal?.aborted) throw options.signal.reason;
			try {
				return await operation(attempt);
			} catch (error) {
				if (options.signal?.aborted || isAborted(error)) throw error;
				const disposition =
					options.classify?.(error) ?? (isTransientError(error) ? 'retry' : 'stop');
				if (disposition === 'stop') throw error;
				if (disposition === 'retry' && ++failures >= (options.maxAttempts ?? 3)) throw error;
				const serverDelay = error instanceof HttpError ? error.retryAfterMs : undefined;
				// Deferred work re-enters its shared limiter; it does not own a separate cooldown.
				const delayMs =
					disposition === 'defer'
						? 0
						: Math.max(
								serverDelay ?? 0,
								Math.round(500 * 2 ** (failures - 1) * (0.75 + random() * 0.5))
							);
				await options.onRetry?.({ state: 'waiting', attempt: attempt + 1, delayMs });
				if (delayMs > 0) await sleep(delayMs, options.signal);
			}
		}
	} finally {
		await options.onRetry?.({ state: 'finished', attempt, delayMs: 0 });
	}
}
