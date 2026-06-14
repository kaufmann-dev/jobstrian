import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { lead } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ starred: z.boolean() });

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success) return json({ message: 'Ungültige Eingabe' }, { status: 400 });
	const [updated] = await db
		.update(lead)
		.set({ starred: body.data.starred })
		.where(eq(lead.id, id.data))
		.returning();
	if (!updated) return json({ message: 'Betrieb nicht gefunden' }, { status: 404 });
	return json(updated);
};
