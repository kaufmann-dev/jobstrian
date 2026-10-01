import { applyProfilePatch, isCvProfileError } from '#lib/server/cv-profile.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	try {
		await applyProfilePatch(body);
		return Response.json({ ok: true });
	} catch (error) {
		if (isCvProfileError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Lebenslauf-Profilaktualisierung fehlgeschlagen', error);
		return Response.json(
			{ message: 'Das Profil konnte nicht aktualisiert werden.' },
			{ status: 500 }
		);
	}
};
