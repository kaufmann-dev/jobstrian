export interface LlmLimiterMetrics {
	requestsPerMinute: number;
	maxConcurrent: number;
	queued: number;
	inFlight: number;
	completed: number;
	failed: number;
	skipped: number;
	lastMinuteStarted: number;
}

interface QueueItem<T> {
	task: (signal: AbortSignal) => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
	controller: AbortController;
	signal?: AbortSignal;
	onAbort?: () => void;
	started: boolean;
}

export interface LlmLimiterOptions {
	requestsPerMinute: number;
	maxConcurrent: number;
	windowMs?: number;
}

export function abortError(): DOMException {
	return new DOMException('The operation was aborted.', 'AbortError');
}

export function isAbortError(err: unknown): boolean {
	return (
		(err instanceof DOMException && err.name === 'AbortError') ||
		(err instanceof Error && err.name === 'AbortError')
	);
}

export class LlmLimiter {
	private readonly requestsPerMinute: number;
	private readonly maxConcurrent: number;
	private readonly windowMs: number;
	private queue: QueueItem<unknown>[] = [];
	private inFlight = 0;
	private startedAt: number[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private completed = 0;
	private failed = 0;
	private skipped = 0;

	constructor(opts: LlmLimiterOptions) {
		this.requestsPerMinute = opts.requestsPerMinute;
		this.maxConcurrent = opts.maxConcurrent;
		this.windowMs = opts.windowMs ?? 60_000;
	}

	metrics(): LlmLimiterMetrics {
		this.pruneStarts();
		return {
			requestsPerMinute: this.requestsPerMinute,
			maxConcurrent: this.maxConcurrent,
			queued: this.queue.length,
			inFlight: this.inFlight,
			completed: this.completed,
			failed: this.failed,
			skipped: this.skipped,
			lastMinuteStarted: this.startedAt.length
		};
	}

	run<T>(task: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (signal?.aborted) {
			this.skipped++;
			return Promise.reject(signal.reason ?? abortError());
		}

		return new Promise<T>((resolve, reject) => {
			const item: QueueItem<T> = {
				task,
				resolve,
				reject,
				controller: new AbortController(),
				signal,
				started: false
			};

			if (signal) {
				item.onAbort = () => {
					item.controller.abort(signal.reason ?? abortError());
					if (!item.started && this.removeQueued(item)) {
						this.skipped++;
						reject(signal.reason ?? abortError());
					}
				};
				signal.addEventListener('abort', item.onAbort, { once: true });
			}

			this.queue.push(item as QueueItem<unknown>);
			this.drain();
		});
	}

	private removeQueued(item: object): boolean {
		const index = this.queue.findIndex((queued) => queued === item);
		if (index === -1) return false;
		this.queue.splice(index, 1);
		return true;
	}

	private pruneStarts(now = Date.now()): void {
		const cutoff = now - this.windowMs;
		while (this.startedAt.length > 0 && this.startedAt[0] <= cutoff) {
			this.startedAt.shift();
		}
	}

	private schedule(nextAt: number): void {
		if (this.timer) return;
		const delay = Math.max(0, nextAt - Date.now());
		this.timer = setTimeout(() => {
			this.timer = null;
			this.drain();
		}, delay);
	}

	private drain(): void {
		this.pruneStarts();
		while (this.inFlight < this.maxConcurrent && this.queue.length > 0) {
			this.pruneStarts();
			if (this.startedAt.length >= this.requestsPerMinute) {
				this.schedule(this.startedAt[0] + this.windowMs + 1);
				return;
			}

			const item = this.queue.shift()!;
			item.started = true;

			this.inFlight++;
			this.startedAt.push(Date.now());
			item
				.task(item.controller.signal)
				.then((value) => {
					this.completed++;
					item.resolve(value);
				})
				.catch((err) => {
					if (isAbortError(err)) this.skipped++;
					else this.failed++;
					item.reject(err);
				})
				.finally(() => {
					if (item.signal && item.onAbort) {
						item.signal.removeEventListener('abort', item.onAbort);
					}
					this.inFlight--;
					this.drain();
				});
		}
	}
}
