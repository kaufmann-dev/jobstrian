import { ZodError } from 'zod';
import { applySettingsPatch } from '#lib/server/settings-patch.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
	try {
		const settings = await applySettingsPatch(person.id, await request.json());
		return Response.json({ ok: true, updatedAt: settings.updatedAt });
	} catch (error) {
		if (error instanceof ZodError) {
			return Response.json(
				{ code: 'invalid_patch', message: 'Ungültige Einstellungen.' },
				{ status: 400 }
			);
		}
		console.error('Speichern der Einstellungen fehlgeschlagen', error);
		return Response.json(
			{ code: 'save_failed', message: 'Speichern fehlgeschlagen.' },
			{ status: 500 }
		);
	}
};
