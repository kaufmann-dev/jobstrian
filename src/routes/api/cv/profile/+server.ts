import { json } from '@sveltejs/kit';
import { applyProfilePatch, isCvProfileError } from '$lib/server/cv-profile';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	try {
		await applyProfilePatch(body);
		return json({ ok: true });
	} catch (error) {
		if (isCvProfileError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('CV profile update failed', error);
		return json({ message: 'Das Profil konnte nicht aktualisiert werden.' }, { status: 500 });
	}
};
