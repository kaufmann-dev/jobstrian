import { chromium, type Browser, type Page } from 'playwright';
import { USER_AGENT } from '../util/http';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		browserPromise = chromium.launch({ headless: true });
	}
	return browserPromise;
}

/** Close the shared browser (call at the end of a run). */
export async function closeBrowser(): Promise<void> {
	if (!browserPromise) return;
	const browser = await browserPromise.catch(() => null);
	browserPromise = null;
	await browser?.close().catch(() => {});
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** Run `fn` with a fresh page in an isolated context, always cleaned up. */
export async function withPage<T>(
	fn: (page: Page) => Promise<T>,
	signal?: AbortSignal
): Promise<T> {
	if (signal?.aborted) throw abortReason(signal);
	const browser = await getBrowser();
	const context = await browser.newContext({
		userAgent: USER_AGENT,
		locale: 'de-AT'
	});
	const closeOnAbort = () => {
		void context.close().catch(() => {});
	};
	if (signal) signal.addEventListener('abort', closeOnAbort, { once: true });
	const page = await context.newPage();
	try {
		if (signal?.aborted) throw abortReason(signal);
		return await fn(page);
	} finally {
		if (signal) signal.removeEventListener('abort', closeOnAbort);
		await context.close().catch(() => {});
	}
}
