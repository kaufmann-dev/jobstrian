import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { applySettingsPatch } from '$lib/server/settings-patch';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const settings = await applySettingsPatch(await request.json());
		return json({ ok: true, updatedAt: settings.updatedAt });
	} catch (error) {
		if (error instanceof ZodError) {
			return json({ code: 'invalid_patch', message: 'Ungültige Einstellungen.' }, { status: 400 });
		}
		console.error('Speichern der Einstellungen fehlgeschlagen', error);
		return json({ code: 'save_failed', message: 'Speichern fehlgeschlagen.' }, { status: 500 });
	}
};
