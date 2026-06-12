import { describe, it, expect } from 'vitest';
import { withPage } from '../browser';

describe('hokify scraper debugging', () => {
	it('scrapes and logs page info', async () => {
		const keyword = 'barista';
		const url = `https://www.hokify.at/jobs/${keyword}/wien`;
		console.log('Navigating to:', url);

		const result = await withPage(async (page) => {
			page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
			page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

			const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
			console.log('Response Status:', res?.status());
			console.log('Response Headers:', JSON.stringify(res?.headers(), null, 2));

			await page.waitForTimeout(5000); // Wait 5s for client-side rendering

			const html = await page.content();
			console.log('HTML Length:', html.length);
			console.log('HTML Snippet (first 1000 chars):', html.slice(0, 1000));

			const anchors = await page.$$eval('a', (elements) => 
				elements.map((el) => ({ href: (el as HTMLAnchorElement).href, text: el.textContent?.trim() }))
			);
			console.log('Found total links count:', anchors.length);
			console.log('Some links:', JSON.stringify(anchors.filter(a => a.href.includes('job') || a.href.includes('suche')).slice(0, 10), null, 2));

			return html;
		});

		expect(result).toBeDefined();
	}, 60000);
});
