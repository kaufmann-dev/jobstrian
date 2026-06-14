import { json } from '@sveltejs/kit';
import { createProfilePreview, isCvProfileError } from '$lib/server/cv-profile';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		return json({ profile: await createProfilePreview() });
	} catch (error) {
		if (isCvProfileError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('CV profile preview failed', error);
		return json({ message: 'Der Lebenslauf konnte nicht ausgewertet werden.' }, { status: 500 });
	}
};
