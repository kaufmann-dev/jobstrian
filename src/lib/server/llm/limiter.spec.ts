import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmLimiter, type LlmFeedback } from './limiter';

describe('adaptive provider queue', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('paces starts evenly and respects simultaneous work', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 60, maxConcurrent: 2 });
		const starts: number[] = [];
		const releases: (() => void)[] = [];
		const tasks = Array.from({ length: 3 }, () =>
			limiter.run(
				() =>
					new Promise<void>((resolve) => {
						starts.push(Date.now());
						releases.push(resolve);
					})
			)
		);
		await vi.advanceTimersByTimeAsync(2000);
		expect(starts).toEqual([0, 1000]);
		releases.shift()!();
		await vi.advanceTimersByTimeAsync(0);
		expect(starts).toEqual([0, 1000, 2000]);
		releases.forEach((release) => release());
		await Promise.all(tasks);
	});

	it('coalesces concurrent 429s and allows only one probe after cooldown', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 600, maxConcurrent: 8, random: () => 0 });
		const feedback: LlmFeedback[] = [];
		const releases: (() => void)[] = [];
		const tasks = Array.from({ length: 4 }, () =>
			limiter.run(
				(_signal, status) =>
					new Promise<void>((resolve) => {
						feedback.push(status);
						releases.push(resolve);
					})
			)
		);
		await vi.advanceTimersByTimeAsync(100);
		feedback[0].response(429, { retryAfterMs: 5000 });
		feedback[1].response(429, { retryAfterMs: 5000 });
		expect(limiter.metrics()).toMatchObject({
			effectiveRequestsPerMinute: 300,
			effectiveMaxConcurrent: 4,
			rateLimitEvents: 2
		});
		releases.splice(0).forEach((release) => release());
		await vi.advanceTimersByTimeAsync(4999);
		expect(feedback).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(feedback).toHaveLength(3);
		await vi.advanceTimersByTimeAsync(1000);
		expect(feedback).toHaveLength(3);
		feedback[2].response(200, {});
		releases.shift()!();
		await vi.advanceTimersByTimeAsync(0);
		expect(feedback).toHaveLength(4);
		feedback[3].response(200, {});
		releases.shift()!();
		await Promise.all(tasks);
		expect(limiter.metrics()).toMatchObject({ cooldownUntil: null, recovering: false });
	});

	it('learns provider ceilings and pauses on token exhaustion even after a successful response', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 10, random: () => 0 });
		await limiter.run(async (_signal, feedback) => {
			feedback.response(200, { requestLimit: 60, exhaustedUntil: 90_000 });
		});
		const next = limiter.run(async () => 'ok');
		await vi.advanceTimersByTimeAsync(89_999);
		expect(limiter.metrics()).toMatchObject({
			effectiveRequestsPerMinute: 60,
			queued: 1,
			completed: 1
		});
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe('ok');
		expect(limiter.metrics().recovering).toBe(false);
	});

	it('reduces again on a failed probe, then gradually recovers without exceeding ceilings', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 8, random: () => 0 });
		await limiter.run(async (_signal, feedback) => {
			feedback.response(429, {});
		});
		const probe = limiter.run(async (_signal, feedback) => {
			feedback.response(429, {});
		});
		await vi.advanceTimersByTimeAsync(30_000);
		await probe;
		expect(limiter.metrics()).toMatchObject({
			effectiveRequestsPerMinute: 25,
			effectiveMaxConcurrent: 2,
			cooldownUntil: 90_000
		});
		const success = limiter.run(async () => 'success');
		await vi.advanceTimersByTimeAsync(60_000);
		await success;
		const successes = Array.from({ length: 10 }, () => limiter.run(async () => 'ok'));
		await vi.advanceTimersByTimeAsync(60_000);
		await Promise.all(successes);
		await limiter.run(async () => 'stable');
		expect(limiter.metrics()).toMatchObject({
			effectiveRequestsPerMinute: 28,
			effectiveMaxConcurrent: 3
		});
		limiter.configure({ requestsPerMinute: 10, maxConcurrent: 1 });
		expect(limiter.metrics()).toMatchObject({
			requestsPerMinute: 10,
			effectiveRequestsPerMinute: 10,
			effectiveMaxConcurrent: 1
		});
	});

	it('cancels all queued work during a long pause and leaves no scheduler timer', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 60, maxConcurrent: 2, random: () => 0 });
		await limiter.run(async (_signal, feedback) => {
			feedback.response(429, { retryAfterMs: 3_600_000 });
		});
		const controller = new AbortController();
		const request = limiter.run(async () => 'never', controller.signal);
		const rejected = expect(request).rejects.toThrow('Canceled');
		controller.abort(new DOMException('Canceled', 'AbortError'));
		await rejected;
		expect(limiter.metrics()).toMatchObject({ queued: 0, inFlight: 0, skipped: 1 });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('keeps pauses, pacing history and queued work when configured limits change', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 10, random: () => 0 });
		await limiter.run(async (_signal, feedback) => {
			feedback.response(429, { retryAfterMs: 5000 });
		});
		const next = limiter.run(async () => 'ok');
		limiter.configure({ requestsPerMinute: 20, maxConcurrent: 2 });
		expect(limiter.metrics()).toMatchObject({
			cooldownUntil: 5000,
			queued: 1,
			effectiveRequestsPerMinute: 20,
			effectiveMaxConcurrent: 2
		});
		await vi.advanceTimersByTimeAsync(5000);
		await expect(next).resolves.toBe('ok');
	});

	it('honors the longest provider delay when Retry-After and token resets differ', async () => {
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 4, random: () => 0 });
		await limiter.run(async (_signal, feedback) => {
			feedback.response(429, { retryAfterMs: 1000, exhaustedUntil: 90_000 });
		});
		expect(limiter.metrics().cooldownUntil).toBe(90_000);
		const next = limiter.run(async () => 'ok');
		await vi.advanceTimersByTimeAsync(89_999);
		expect(limiter.metrics().queued).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe('ok');
	});
});
