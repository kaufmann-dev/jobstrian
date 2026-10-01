import { createProfilePreview, isCvProfileError } from '#lib/server/cv-profile.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		return Response.json({ profile: await createProfilePreview() });
	} catch (error) {
		if (isCvProfileError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Lebenslauf-Profilvorschau fehlgeschlagen', error);
		return Response.json(
			{ message: 'Der Lebenslauf konnte nicht ausgewertet werden.' },
			{ status: 500 }
		);
	}
};
