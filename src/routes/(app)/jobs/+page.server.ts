import { desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { listing } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const listings = await db
		.select()
		.from(listing)
		.orderBy(sql`${listing.rankScore} desc nulls last`, desc(listing.firstSeenAt))
		.limit(1000);
	return { listings };
};
