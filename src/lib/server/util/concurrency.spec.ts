import { expect, it } from 'vitest';
import { mapLimit } from './concurrency';

it('waits for running workers to finish cleanup before rejecting', async () => {
	let release!: () => void;
	let cleaned = false;
	let settled = false;
	const failure = new Error('worker failed');
	const pending = mapLimit([1, 2], 2, async (item) => {
		if (item === 1) throw failure;
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		cleaned = true;
	});
	const rejected = pending.catch((error) => {
		settled = true;
		expect(error).toBe(failure);
		expect(cleaned).toBe(true);
	});
	await Promise.resolve();
	expect(settled).toBe(false);
	release();
	await rejected;
});
