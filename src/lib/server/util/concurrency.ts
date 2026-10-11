/** Map over items with a bounded number of concurrent workers, preserving order. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
	signal?: AbortSignal
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const worker = async () => {
		while (cursor < items.length) {
			if (signal?.aborted) throw signal.reason;
			const index = cursor++;
			results[index] = await fn(items[index], index);
		}
	};
	const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
	// Drain every worker before returning a failure: pending cleanup/progress writes
	// must finish before the caller persists a terminal run state.
	const outcomes = await Promise.allSettled(workers);
	const failure = outcomes.find((outcome) => outcome.status === 'rejected');
	if (failure?.status === 'rejected') throw failure.reason;
	return results;
}
