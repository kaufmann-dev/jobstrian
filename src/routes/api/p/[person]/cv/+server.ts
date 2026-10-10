import { error } from '@sveltejs/kit';
import { getCvData, saveCv, deleteCv } from '#lib/server/cv.js';
import { isAllowedCvFile } from '#lib/server/cv-validation.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitize(name: string): string {
	const base = name
		.replace(/[/\\]/g, '')
		.replace(/[^A-Za-z0-9._ -]/g, '_')
		.trim();
	return base || 'lebenslauf.pdf';
}

/** Download the stored CV. */
export const GET: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	const file = await getCvData(person.id);
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
export const POST: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Keine Datei übermittelt');
	if (file.size === 0) error(400, 'Leere Datei');
	if (file.size > MAX_BYTES) error(413, 'Datei zu groß (max. 10 MB)');
	if (!isAllowedCvFile(file)) error(415, 'Nur PDF-Dateien erlaubt');

	const buffer = Buffer.from(await file.arrayBuffer());
	await saveCv(person.id, sanitize(file.name), 'application/pdf', buffer);
	return Response.json({ ok: true, filename: sanitize(file.name), size: buffer.length });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	await deleteCv(person.id);
	return Response.json({ ok: true });
};
