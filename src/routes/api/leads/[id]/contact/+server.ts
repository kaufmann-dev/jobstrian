import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { leadContactSchema } from '$lib/lead-contact';
import { db } from '$lib/server/db';
import { lead } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = leadContactSchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success) return json({ message: 'Ungültige Eingabe' }, { status: 400 });

	const update: Partial<typeof lead.$inferInsert> = {};
	if (body.data.phone !== undefined) {
		update.phone = body.data.phone;
		update.phoneManual = true;
	}
	if (body.data.email !== undefined) {
		update.email = body.data.email;
		update.emailManual = true;
		update.emailSource = body.data.email ? 'manual' : null;
		update.contentHash = null;
	}

	const [updated] = await db.update(lead).set(update).where(eq(lead.id, id.data)).returning();
	if (!updated) return json({ message: 'Betrieb nicht gefunden' }, { status: 404 });
	return json(updated);
};
