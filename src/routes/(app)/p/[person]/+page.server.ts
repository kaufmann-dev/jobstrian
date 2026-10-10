import { sql, eq, and, desc, isNotNull, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { listing, lead, scrapeRun } from '#lib/server/db/schema.js';
import { visibleLeadEmail } from '#lib/server/lead-email.js';
import { overview } from '#lib/server/applications/service.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { PageServerLoad } from './$types';

async function count(where: SQL | undefined, table: typeof listing | typeof lead) {
	const q = db.select({ n: sql<number>`count(*)::int` }).from(table);
	const [row] = where ? await q.where(where) : await q;
	return row?.n ?? 0;
}

export const load: PageServerLoad = async ({ params }) => {
	const person = await requirePerson(params);
	const ownListing = eq(listing.personId, person.id);
	const ownLead = eq(lead.personId, person.id);
	const [
		activeListings,
		closedListings,
		rankedListings,
		totalLeads,
		leadsWithEmail,
		openLeads,
		[summary]
	] = await Promise.all([
		count(and(ownListing, eq(listing.status, 'active')), listing),
		count(and(ownListing, eq(listing.status, 'closed')), listing),
		count(and(ownListing, eq(listing.status, 'active'), isNotNull(listing.rankScore)), listing),
		count(ownLead, lead),
		count(and(ownLead, visibleLeadEmail()), lead),
		count(and(ownLead, eq(lead.hasActivePosting, false)), lead),
		overview(person.id)
	]);

	const [latestRun] = await db
		.select()
		.from(scrapeRun)
		.where(eq(scrapeRun.personId, person.id))
		.orderBy(desc(scrapeRun.id))
		.limit(1);

	return {
		stats: {
			activeListings,
			closedListings,
			rankedListings,
			totalLeads,
			leadsWithEmail,
			openLeads
		},
		latestRun: latestRun ?? null,
		tracker: summary
	};
};
