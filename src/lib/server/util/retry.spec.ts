import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortableSleep, HttpError, withRetry } from './retry';

afterEach(() => vi.useRealTimers());

describe('shared retries', () => {
	it('recovers, observes completion, and respects the server minimum delay', async () => {
		const operation = vi
			.fn()
			.mockRejectedValueOnce(new HttpError(503, 'busy', 2500))
			.mockResolvedValue('ok');
		const sleep = vi.fn().mockResolvedValue(undefined);
		const statuses: string[] = [];
		await expect(
			withRetry(operation, {
				sleep,
				random: () => 0,
				onRetry: (status) => {
					statuses.push(status.state);
				}
			})
		).resolves.toBe('ok');
		expect(operation).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(2500, undefined);
		expect(statuses).toEqual(['attempt', 'waiting', 'attempt', 'finished']);
	});
	it('exhausts ordinary errors once and never retries permanent failures', async () => {
		const operation = vi.fn().mockRejectedValue(new TypeError('network'));
		await expect(withRetry(operation, { sleep: async () => {} })).rejects.toThrow('network');
		expect(operation).toHaveBeenCalledTimes(3);
		operation.mockClear().mockRejectedValue(new HttpError(403, 'denied'));
		await expect(withRetry(operation)).rejects.toThrow('denied');
		expect(operation).toHaveBeenCalledTimes(1);
	});
	it('does not spend the ordinary attempt budget on deferred capacity failures', async () => {
		let calls = 0;
		const value = await withRetry(
			async () => {
				if (++calls <= 5) throw new HttpError(429, 'busy');
				return 'ok';
			},
			{ classify: () => 'defer' }
		);
		expect(value).toBe('ok');
		expect(calls).toBe(6);
	});
	it('cleans up an interrupted wait', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const pending = abortableSleep(60_000, controller.signal);
		const rejected = expect(pending).rejects.toThrow('Canceled');
		controller.abort(new DOMException('Canceled', 'AbortError'));
		await rejected;
		expect(vi.getTimerCount()).toBe(0);
	});
});
