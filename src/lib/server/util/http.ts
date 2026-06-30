export const USER_AGENT = 'JobstrianBot/0.1 (personal job-search assistant)';

export interface FetchOpts {
	timeoutMs?: number;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

/** fetch with a default timeout and polite User-Agent. */
export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
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
		return await fetch(url, {
			headers: { 'user-agent': USER_AGENT, ...opts.headers },
			signal: ctrl.signal
		});
	} finally {
		clearTimeout(timeout);
		opts.signal?.removeEventListener('abort', abortFromParent);
	}
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
	const res = await politeFetch(url, opts);
	if (!res.ok) throw new Error(`Abruf fehlgeschlagen: ${url} -> ${res.status}`);
	return res.text();
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
	const res = await politeFetch(url, {
		...opts,
		headers: { accept: 'application/json', ...opts.headers }
	});
	if (!res.ok) throw new Error(`Abruf fehlgeschlagen: ${url} -> ${res.status}`);
	return res.json() as Promise<T>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
