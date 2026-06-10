import { error, json } from '@sveltejs/kit';
import { getCvData, saveCv, deleteCv } from '$lib/server/cv';
import type { RequestHandler } from './$types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function sanitize(name: string): string {
	const base = name.replace(/[/\\]/g, '').replace(/[^A-Za-z0-9._ -]/g, '_').trim();
	return base || 'lebenslauf.pdf';
}

/** Download the stored CV. */
export const GET: RequestHandler = async () => {
	const file = await getCvData();
	if (!file) error(404, 'Kein Lebenslauf hinterlegt');
	return new Response(new Uint8Array(file.data), {
		headers: {
			'content-type': file.mimeType,
			'content-disposition': `attachment; filename="${sanitize(file.filename)}"`,
			'content-length': String(file.size)
		}
	});
};

/** Upload / replace the CV (multipart form, field "file"). */
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Keine Datei übermittelt');
	if (file.size === 0) error(400, 'Leere Datei');
	if (file.size > MAX_BYTES) error(413, 'Datei zu groß (max. 10 MB)');
	if (file.type && !ALLOWED.has(file.type)) error(415, 'Nur PDF oder Word-Dokumente erlaubt');

	const buffer = Buffer.from(await file.arrayBuffer());
	await saveCv(sanitize(file.name), file.type || 'application/pdf', buffer);
	return json({ ok: true, filename: sanitize(file.name), size: buffer.length });
};

export const DELETE: RequestHandler = async () => {
	await deleteCv();
	return json({ ok: true });
};
