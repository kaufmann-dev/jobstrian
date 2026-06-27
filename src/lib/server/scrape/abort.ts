function abortFallback(error: unknown): unknown {
	return error ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
	const value =
		error instanceof Error
			? `${error.name} ${error.message}`
			: typeof error === 'string'
				? error
				: '';
	return /\b(?:aborterror|abort_err|aborted|abort)\b/i.test(value);
}

export function rethrowIfAbort(error: unknown, signal?: AbortSignal): void {
	if (signal?.aborted) throw abortFallback(signal.reason ?? error);
	if (isAbortError(error)) throw error;
}
