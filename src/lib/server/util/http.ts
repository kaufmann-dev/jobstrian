import { HttpError, parseRetryAfter, withRetry, type RetryObserver } from './retry';

export const USER_AGENT = 'JobstrianBot/0.1 (personal job-search assistant)';

export interface FetchOpts {
	timeoutMs?: number;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	onRetry?: RetryObserver;
}

/** fetch with a default timeout and polite User-Agent. */
export async function politeFetch<T = Response>(
	url: string,
	opts: FetchOpts = {},
	consume?: (response: Response) => Promise<T>
): Promise<T> {
	const ctrl = new AbortController();
	const timeout = setTimeout(
		() => ctrl.abort(new DOMException('Abruf hat das Zeitlimit überschritten.', 'TimeoutError')),
		opts.timeoutMs ?? 15_000
	);
	const abortFromParent = () => {
		ctrl.abort(
			opts.signal?.reason ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError')
		);
	};
	if (opts.signal) {
		if (opts.signal.aborted) {
			abortFromParent();
		} else {
			opts.signal.addEventListener('abort', abortFromParent, { once: true });
		}
	}
	try {
		const response = await fetch(url, {
			headers: { 'user-agent': USER_AGENT, ...opts.headers },
			signal: ctrl.signal
		});
		return consume ? await consume(response) : (response as T);
	} catch (error) {
		if (ctrl.signal.aborted) throw ctrl.signal.reason;
		throw error;
	} finally {
		clearTimeout(timeout);
		opts.signal?.removeEventListener('abort', abortFromParent);
	}
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
	return withRetry(
		() =>
			politeFetch(url, opts, async (res) => {
				if (!res.ok) {
					await res.body?.cancel();
					throw new HttpError(
						res.status,
						`Abruf fehlgeschlagen: ${url} -> ${res.status}`,
						parseRetryAfter(res.headers.get('retry-after'))
					);
				}
				return res.text();
			}),
		{ signal: opts.signal, onRetry: opts.onRetry }
	);
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
	return withRetry(
		() =>
			politeFetch(
				url,
				{
					...opts,
					headers: { accept: 'application/json', ...opts.headers }
				},
				async (res) => {
					if (!res.ok) {
						await res.body?.cancel();
						throw new HttpError(
							res.status,
							`Abruf fehlgeschlagen: ${url} -> ${res.status}`,
							parseRetryAfter(res.headers.get('retry-after'))
						);
					}
					return res.json() as Promise<T>;
				}
			),
		{ signal: opts.signal, onRetry: opts.onRetry }
	);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
