import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#lib/server/db/index.js';
import { lead } from '#lib/server/db/schema.js';
import { maskLeadEmail } from '#lib/server/lead-email.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ status: z.enum(['new', 'contacted', 'ignored']) });

export const PATCH: RequestHandler = async ({ params, request }) => {
	const person = await requirePerson(params);
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success)
		return Response.json({ message: 'Ungültige Eingabe' }, { status: 400 });
	const [updated] = await db
		.update(lead)
		.set({ status: body.data.status })
		.where(and(eq(lead.id, id.data), eq(lead.personId, person.id)))
		.returning();
	if (!updated) return Response.json({ message: 'Betrieb nicht gefunden' }, { status: 404 });
	return Response.json(maskLeadEmail(updated));
};
