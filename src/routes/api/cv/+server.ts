import { error, json } from '@sveltejs/kit';
import { getCvData, saveCv, deleteCv } from '$lib/server/cv';
import type { RequestHandler } from './$types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream']);

function sanitize(name: string): string {
	const base = name.replace(/[/\\]/g, '').replace(/[^A-Za-z0-9._ -]/g, '_').trim();
	return base || 'lebenslauf.pdf';
}

function extension(name: string): string {
	const index = name.lastIndexOf('.');
	return index === -1 ? '' : name.slice(index).toLowerCase();
}

function isAllowedCvFile(file: File): boolean {
	if (ALLOWED.has(file.type)) return true;

	const ext = extension(file.name);
	return GENERIC_MIME_TYPES.has(file.type) && ALLOWED_EXTENSIONS.has(ext);
}

function mimeTypeFor(file: File): string {
	if (ALLOWED.has(file.type)) return file.type;

	const ext = extension(file.name);
	if (ext === '.doc') return 'application/msword';
	if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	return 'application/pdf';
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
	if (!isAllowedCvFile(file)) error(415, 'Nur PDF oder Word-Dokumente erlaubt');

	const buffer = Buffer.from(await file.arrayBuffer());
	await saveCv(sanitize(file.name), mimeTypeFor(file), buffer);
	return json({ ok: true, filename: sanitize(file.name), size: buffer.length });
};

export const DELETE: RequestHandler = async () => {
	await deleteCv();
	return json({ ok: true });
};
