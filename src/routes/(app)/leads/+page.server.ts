import { asc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { lead } from '$lib/server/db/schema';
import { getCvMeta } from '$lib/server/cv';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const leads = await db
		.select()
		.from(lead)
		.orderBy(sql`${lead.rankScore} desc nulls last`, asc(lead.distanceMeters))
		.limit(1000);
	return { leads, hasCv: (await getCvMeta()) !== null };
};

const STATUSES = ['new', 'contacted', 'ignored'] as const;

export const actions: Actions = {
	setStatus: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const status = String(data.get('status'));
		if (!Number.isFinite(id) || !STATUSES.includes(status as (typeof STATUSES)[number])) {
			return fail(400, { message: 'Ungültige Eingabe' });
		}
		await db
			.update(lead)
			.set({ status: status as (typeof STATUSES)[number] })
			.where(eq(lead.id, id));
		return { success: true };
	}
};
