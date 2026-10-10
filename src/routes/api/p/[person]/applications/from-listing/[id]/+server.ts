import { z } from 'zod';
import {
	createApplicationFromListing,
	findApplicationForListing,
	isServiceError
} from '#lib/server/applications/service.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

/** Create (or find) the application for a Stelle. */
export const POST: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	const id = z.coerce.number().int().positive().safeParse(params.id);
	if (!id.success) return Response.json({ message: 'Ungültige Eingabe' }, { status: 400 });
	try {
		const existed = (await findApplicationForListing(person.id, id.data)) !== null;
		const created = await createApplicationFromListing(person.id, id.data);
		return Response.json({ application: created, existed });
	} catch (error) {
		if (isServiceError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Bewerbung konnte nicht angelegt werden', error);
		return Response.json({ message: 'Bewerbung konnte nicht angelegt werden.' }, { status: 500 });
	}
};
