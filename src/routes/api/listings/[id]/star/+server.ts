import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#lib/server/db/index.js';
import { listing } from '#lib/server/db/schema.js';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ starred: z.boolean() });

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success)
		return Response.json({ message: 'Ungültige Eingabe' }, { status: 400 });
	const [updated] = await db
		.update(listing)
		.set({ starred: body.data.starred })
		.where(eq(listing.id, id.data))
		.returning();
	if (!updated) return Response.json({ message: 'Stelle nicht gefunden' }, { status: 404 });
	return Response.json(updated);
};
