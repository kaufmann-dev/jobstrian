import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmLimiter } from './limiter';

describe('LlmLimiter', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('respects maxConcurrent', async () => {
		expect.hasAssertions();
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 2 });
		let active = 0;
		let maxActive = 0;
		const releases: (() => void)[] = [];

		const promises = Array.from({ length: 5 }, () =>
			limiter.run(
				() =>
					new Promise<void>((resolve) => {
						active++;
						maxActive = Math.max(maxActive, active);
						releases.push(() => {
							active--;
							resolve();
						});
					})
			)
		);

		await Promise.resolve();
		expect(maxActive).toBe(2);

		for (let i = 0; i < 5; i++) {
			while (releases.length === 0) {
				await Promise.resolve();
			}
			releases.shift()?.();
			await Promise.resolve();
		}
		await Promise.all(promises);
		expect(active).toBe(0);
	});

	it('paces starts by the configured per-minute budget', async () => {
		expect.hasAssertions();
		vi.useFakeTimers();
		const limiter = new LlmLimiter({
			requestsPerMinute: 2,
			maxConcurrent: 10,
			windowMs: 60_000
		});
		const starts: number[] = [];

		const promises = Array.from({ length: 3 }, () =>
			limiter.run(async () => {
				starts.push(Date.now());
				return starts.length;
			})
		);

		await vi.advanceTimersByTimeAsync(0);
		expect(starts).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(starts).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(1);
		await Promise.all(promises);
		expect(starts).toHaveLength(3);
		expect(starts[2]).toBeGreaterThanOrEqual(60_001);
	});

	it('aborts queued work', async () => {
		expect.hasAssertions();
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 1 });
		const controller = new AbortController();
		let releaseFirst: (() => void) | undefined;

		const first = limiter.run(
			() =>
				new Promise<void>((resolve) => {
					releaseFirst = resolve;
				})
		);
		const second = limiter.run(async () => 'second', controller.signal);

		controller.abort(new DOMException('Canceled', 'AbortError'));
		await expect(second).rejects.toThrow('Canceled');
		releaseFirst?.();
		await expect(first).resolves.toBeUndefined();
		expect(limiter.metrics().skipped).toBe(1);
	});

	it('propagates failures and continues later queued work', async () => {
		expect.hasAssertions();
		const limiter = new LlmLimiter({ requestsPerMinute: 100, maxConcurrent: 1 });
		const order: string[] = [];

		const first = limiter.run(async () => {
			order.push('first');
			throw new Error('boom');
		});
		const second = limiter.run(async () => {
			order.push('second');
			return 2;
		});

		await expect(first).rejects.toThrow('boom');
		await expect(second).resolves.toBe(2);
		expect(order).toEqual(['first', 'second']);
		expect(limiter.metrics().failed).toBe(1);
	});
});
