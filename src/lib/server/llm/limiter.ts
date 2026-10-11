import type { RateLimitHints } from './rate-limits';

export interface LlmLimiterMetrics {
	requestsPerMinute: number;
	maxConcurrent: number;
	effectiveRequestsPerMinute: number;
	effectiveMaxConcurrent: number;
	cooldownUntil: number | null;
	recovering: boolean;
	rateLimitEvents: number;
	queued: number;
	inFlight: number;
	completed: number;
	failed: number;
	skipped: number;
	lastMinuteStarted: number;
}

export interface LlmFeedback {
	response(status: number, hints: RateLimitHints, accessBlocked?: boolean): void;
}
interface QueueItem<T> {
	task: (signal: AbortSignal, feedback: LlmFeedback) => Promise<T>;
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
	now?: () => number;
	random?: () => number;
}

const STABLE_WINDOW_MS = 60_000;
const COOLDOWN_BASE_MS = 30_000;
const COOLDOWN_MAX_MS = 300_000;

export function abortError(): DOMException {
	return new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError');
}
export function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

/** A paced, adaptive provider queue shared across all models and people of a connection. */
export class LlmLimiter {
	private requestsPerMinute: number;
	private maxConcurrent: number;
	private effectiveRequestsPerMinute: number;
	private effectiveMaxConcurrent: number;
	private providerRequestLimit = Infinity;
	private readonly windowMs: number;
	private readonly now: () => number;
	private readonly random: () => number;
	private queue: QueueItem<unknown>[] = [];
	private inFlight = 0;
	private startedAt: number[] = [];
	private lastStart: number | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private completed = 0;
	private failed = 0;
	private skipped = 0;
	private generation = 0;
	private cooldownUntil: number | null = null;
	private recovering = false;
	private probeInFlight = false;
	private rateLimitEvents = 0;
	private unsuccessfulRecoveries = 0;
	private stableSince: number;
	private successes = 0;

	constructor(opts: LlmLimiterOptions) {
		this.requestsPerMinute = Math.max(1, Math.floor(opts.requestsPerMinute));
		this.maxConcurrent = Math.max(1, Math.floor(opts.maxConcurrent));
		this.effectiveRequestsPerMinute = this.requestsPerMinute;
		this.effectiveMaxConcurrent = this.maxConcurrent;
		this.windowMs = opts.windowMs ?? 60_000;
		this.now = opts.now ?? Date.now;
		this.random = opts.random ?? Math.random;
		this.stableSince = this.now();
	}

	configure(limits: Pick<LlmLimiterOptions, 'requestsPerMinute' | 'maxConcurrent'>): void {
		this.requestsPerMinute = Math.max(1, Math.floor(limits.requestsPerMinute));
		this.maxConcurrent = Math.max(1, Math.floor(limits.maxConcurrent));
		this.effectiveRequestsPerMinute = Math.min(this.effectiveRequestsPerMinute, this.rpmCeiling());
		this.effectiveMaxConcurrent = Math.min(this.effectiveMaxConcurrent, this.maxConcurrent);
		this.drain();
	}

	metrics(): LlmLimiterMetrics {
		this.pruneStarts();
		return {
			requestsPerMinute: this.requestsPerMinute,
			maxConcurrent: this.maxConcurrent,
			effectiveRequestsPerMinute: this.effectiveRequestsPerMinute,
			effectiveMaxConcurrent: this.effectiveMaxConcurrent,
			cooldownUntil:
				this.cooldownUntil != null && this.cooldownUntil > this.now() ? this.cooldownUntil : null,
			recovering: this.recovering,
			rateLimitEvents: this.rateLimitEvents,
			queued: this.queue.length,
			inFlight: this.inFlight,
			completed: this.completed,
			failed: this.failed,
			skipped: this.skipped,
			lastMinuteStarted: this.startedAt.length
		};
	}

	run<T>(task: QueueItem<T>['task'], signal?: AbortSignal): Promise<T> {
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
					if (!item.started) {
						const index = this.queue.indexOf(item as QueueItem<unknown>);
						if (index !== -1) {
							this.queue.splice(index, 1);
							this.skipped++;
							signal.removeEventListener('abort', item.onAbort!);
							reject(signal.reason ?? abortError());
							this.drain();
						}
					}
				};
				signal.addEventListener('abort', item.onAbort, { once: true });
			}
			this.queue.push(item as QueueItem<unknown>);
			this.drain();
		});
	}

	private rpmCeiling(): number {
		return Math.min(this.requestsPerMinute, this.providerRequestLimit);
	}
	private pruneStarts(): void {
		const cutoff = this.now() - this.windowMs;
		while (this.startedAt.length > 0 && this.startedAt[0] <= cutoff) this.startedAt.shift();
	}
	private resetStability(): void {
		this.stableSince = this.now();
		this.successes = 0;
	}

	private observe(
		status: number,
		hints: RateLimitHints,
		generation: number,
		probe: boolean,
		accessBlocked: boolean
	): void {
		const now = this.now();
		if (accessBlocked) return;
		if (hints.requestLimit != null) {
			this.providerRequestLimit =
				generation === this.generation
					? hints.requestLimit
					: Math.min(this.providerRequestLimit, hints.requestLimit);
			if (this.effectiveRequestsPerMinute > this.rpmCeiling()) {
				this.effectiveRequestsPerMinute = this.rpmCeiling();
				this.resetStability();
			}
		}
		if (status === 429) {
			this.rateLimitEvents++;
			if (generation === this.generation) {
				this.generation++;
				this.effectiveRequestsPerMinute = Math.max(
					1,
					Math.floor(this.effectiveRequestsPerMinute / 2)
				);
				this.effectiveMaxConcurrent = Math.max(1, Math.floor(this.effectiveMaxConcurrent / 2));
				this.unsuccessfulRecoveries++;
				this.resetStability();
			}
			const fallback = Math.min(
				COOLDOWN_MAX_MS,
				COOLDOWN_BASE_MS * 2 ** Math.min(20, Math.max(0, this.unsuccessfulRecoveries - 1))
			);
			const pause = Math.max(
				1000,
				hints.retryAfterMs ?? 0,
				hints.exhaustedUntil != null ? hints.exhaustedUntil - now : 0,
				hints.retryAfterMs == null && hints.exhaustedUntil == null ? fallback : 0
			);
			this.cooldownUntil = Math.max(
				this.cooldownUntil ?? 0,
				now + pause + Math.round(this.random() * Math.min(1000, pause * 0.1))
			);
			this.recovering = true;
			return;
		}
		if (generation !== this.generation) return;
		if (probe) {
			this.recovering = false;
			this.resetStability();
		}
		if (hints.exhaustedUntil != null && hints.exhaustedUntil > now) {
			this.cooldownUntil = Math.max(this.cooldownUntil ?? 0, hints.exhaustedUntil);
			this.recovering = true;
			this.generation++;
			this.resetStability();
			return;
		}
		if (status >= 200 && status < 300) {
			this.successes++;
			const needed = Math.max(1, Math.min(10, Math.ceil(this.effectiveRequestsPerMinute / 4)));
			if (
				!this.recovering &&
				now - this.stableSince >= STABLE_WINDOW_MS &&
				this.successes >= needed
			) {
				this.effectiveRequestsPerMinute = Math.min(
					this.rpmCeiling(),
					this.effectiveRequestsPerMinute +
						Math.max(1, Math.ceil(this.effectiveRequestsPerMinute * 0.1))
				);
				this.effectiveMaxConcurrent = Math.min(this.maxConcurrent, this.effectiveMaxConcurrent + 1);
				this.unsuccessfulRecoveries = 0;
				this.resetStability();
			}
		}
	}

	private clearTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
	private schedule(nextAt: number): void {
		this.clearTimer();
		this.timer = setTimeout(
			() => {
				this.timer = null;
				this.drain();
			},
			Math.min(2_147_483_647, Math.max(1, nextAt - this.now()))
		);
	}
	private drain(): void {
		this.clearTimer();
		if (this.queue.length === 0) return;
		const now = this.now();
		if (this.cooldownUntil != null && this.cooldownUntil > now) {
			this.schedule(this.cooldownUntil);
			return;
		}
		this.cooldownUntil = null;
		if (
			(this.recovering && (this.probeInFlight || this.inFlight > 0)) ||
			this.inFlight >= this.effectiveMaxConcurrent
		)
			return;
		this.pruneStarts();
		let nextAt =
			this.lastStart == null
				? now
				: this.lastStart + Math.ceil(this.windowMs / this.effectiveRequestsPerMinute);
		if (this.startedAt.length >= this.effectiveRequestsPerMinute)
			nextAt = Math.max(nextAt, this.startedAt[0] + this.windowMs + 1);
		if (nextAt > now) {
			this.schedule(nextAt);
			return;
		}
		const item = this.queue.shift()!;
		item.started = true;
		const generation = this.generation;
		const probe = this.recovering;
		if (probe) this.probeInFlight = true;
		this.inFlight++;
		this.startedAt.push(now);
		this.lastStart = now;
		let observed = false;
		const feedback: LlmFeedback = {
			response: (status, hints, blocked = false) => {
				observed = true;
				this.observe(status, hints, generation, probe, blocked);
			}
		};
		Promise.resolve()
			.then(() => item.task(item.controller.signal, feedback))
			.then((value) => {
				if (!observed) this.observe(200, {}, generation, probe, false);
				this.completed++;
				item.resolve(value);
			})
			.catch((err) => {
				if (isAbortError(err) || item.controller.signal.aborted) this.skipped++;
				else this.failed++;
				item.reject(err);
			})
			.finally(() => {
				if (item.signal && item.onAbort) item.signal.removeEventListener('abort', item.onAbort);
				this.inFlight--;
				if (probe) this.probeInFlight = false;
				this.drain();
			});
		this.drain();
	}
}
