import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { validateAustrianAddress } from '$lib/server/geo/nominatim';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	address: z.string().max(500)
});

export const POST: RequestHandler = async ({ request }) => {
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return json({ message: 'Ungültige Adresse.' }, { status: 400 });

	const address = body.data.address.trim();
	if (address.length < 3) return json({ valid: false, suggestion: null });

	try {
		const suggestion = await validateAustrianAddress(address);
		return json({ valid: Boolean(suggestion), suggestion });
	} catch (error) {
		console.error('Address validation failed', error);
		return json({ message: 'Adresse konnte nicht geprüft werden.' }, { status: 502 });
	}
};
