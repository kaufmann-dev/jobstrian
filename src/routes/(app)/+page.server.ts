import { sql, eq, and, desc, isNotNull, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { listing, lead, scrapeRun } from '$lib/server/db/schema';
import { visibleLeadEmail } from '$lib/server/lead-email';
import type { PageServerLoad } from './$types';

async function count(where: SQL | undefined, table: typeof listing | typeof lead) {
	const q = db.select({ n: sql<number>`count(*)::int` }).from(table);
	const [row] = where ? await q.where(where) : await q;
	return row?.n ?? 0;
}

export const load: PageServerLoad = async () => {
	const [activeListings, closedListings, rankedListings, totalLeads, leadsWithEmail, openLeads] =
		await Promise.all([
			count(eq(listing.status, 'active'), listing),
			count(eq(listing.status, 'closed'), listing),
			count(and(eq(listing.status, 'active'), isNotNull(listing.rankScore)), listing),
			count(undefined, lead),
			count(visibleLeadEmail(), lead),
			count(eq(lead.hasActivePosting, false), lead)
		]);

	const [latestRun] = await db.select().from(scrapeRun).orderBy(desc(scrapeRun.id)).limit(1);

	return {
		stats: {
			activeListings,
			closedListings,
			rankedListings,
			totalLeads,
			leadsWithEmail,
			openLeads
		},
		latestRun: latestRun ?? null
	};
};
