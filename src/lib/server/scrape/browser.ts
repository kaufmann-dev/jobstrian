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

/** Run `fn` with a fresh page in an isolated context, always cleaned up. */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
	const browser = await getBrowser();
	const context = await browser.newContext({
		userAgent: USER_AGENT,
		locale: 'de-AT'
	});
	const page = await context.newPage();
	try {
		return await fn(page);
	} finally {
		await context.close().catch(() => {});
	}
}
