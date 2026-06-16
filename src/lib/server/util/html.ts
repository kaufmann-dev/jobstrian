import * as cheerio from 'cheerio';

/** Max characters of cleaned description we keep; the rank prompt slices further. */
const MAX_DESCRIPTION_CHARS = 8000;

/**
 * Convert an HTML (or plain-text) job description into normalized plain text:
 * replace tags with spaces (so block boundaries never merge adjacent words),
 * decode HTML entities, collapse whitespace, trim, and cap length. Idempotent
 * for text that contains no markup.
 */
export function htmlToText(html: string): string {
	const withoutTags = html.replace(/<[^>]+>/g, ' ');
	const decoded = cheerio.load(`<body>${withoutTags}</body>`)('body').text();
	return decoded.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_CHARS);
}
