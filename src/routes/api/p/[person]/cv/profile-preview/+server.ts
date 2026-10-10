import { createProfilePreview, isCvProfileError } from '#lib/server/cv-profile.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	try {
		return Response.json({ profile: await createProfilePreview(person.id) });
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
