import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#lib/server/db/index.js';
import { listing } from '#lib/server/db/schema.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ starred: z.boolean() });

export const PATCH: RequestHandler = async ({ params, request }) => {
	const person = await requirePerson(params);
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success)
		return Response.json({ message: 'Ungültige Eingabe' }, { status: 400 });
	const [updated] = await db
		.update(listing)
		.set({ starred: body.data.starred })
		.where(and(eq(listing.id, id.data), eq(listing.personId, person.id)))
		.returning();
	if (!updated) return Response.json({ message: 'Stelle nicht gefunden' }, { status: 404 });
	return Response.json(updated);
};
