import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { leadContactSchema } from '#lib/lead-contact.js';
import { db } from '#lib/server/db/index.js';
import { lead } from '#lib/server/db/schema.js';
import { maskLeadEmail } from '#lib/server/lead-email.js';
import { ensureLeadDraft } from '#lib/server/application-email/drafts.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = z.coerce.number().int().positive().safeParse(params.id);
	const body = leadContactSchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success)
		return Response.json({ message: 'Ungültige Eingabe' }, { status: 400 });

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
	if (body.data.website !== undefined) {
		update.website = body.data.website;
		update.websiteManual = true;
		update.contentHash = null;
	}

	const [updated] = await db.update(lead).set(update).where(eq(lead.id, id.data)).returning();
	if (!updated) return Response.json({ message: 'Betrieb nicht gefunden' }, { status: 404 });
	if (body.data.email !== undefined && updated.email) {
		const result = await ensureLeadDraft(updated.id);
		return Response.json({ ...maskLeadEmail(result.lead), draftWarning: result.warning });
	}
	return Response.json(maskLeadEmail(updated));
};
