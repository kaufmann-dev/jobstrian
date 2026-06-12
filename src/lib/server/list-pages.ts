import { and, asc, desc, eq, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
	DEFAULT_LEAD_FILTERS,
	DEFAULT_LISTING_FILTERS,
	LIST_BATCH_SIZE,
	type CursorPage,
	type LeadFilters,
	type ListingFilters
} from '$lib/list-pages';
import { db } from './db';
import { lead, listing, type Lead, type Listing } from './db/schema';

const listingCursorSchema = z.object({
	starred: z.boolean(),
	score: z.number().int().nullable(),
	firstSeenAt: z.string(),
	id: z.number().int()
});

const leadCursorSchema = z.object({
	score: z.number().int().nullable(),
	distanceMeters: z.number().int(),
	id: z.number().int()
});

export const listingFiltersSchema = z.object({
	source: z.string().min(1).nullable().default(DEFAULT_LISTING_FILTERS.source),
	verdict: z.enum(['strong', 'maybe', 'weak']).nullable().default(DEFAULT_LISTING_FILTERS.verdict),
	showClosed: z.boolean().default(DEFAULT_LISTING_FILTERS.showClosed),
	cursor: z.string().min(1).nullable().default(null)
});

export const leadFiltersSchema = z.object({
	onlyWithEmail: z.boolean().default(DEFAULT_LEAD_FILTERS.onlyWithEmail),
	onlyOpen: z.boolean().default(DEFAULT_LEAD_FILTERS.onlyOpen),
	hideIgnored: z.boolean().default(DEFAULT_LEAD_FILTERS.hideIgnored),
	cursor: z.string().min(1).nullable().default(null)
});

function encodeCursor(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor<T>(cursor: string | null, schema: z.ZodType<T>): T | null {
	if (!cursor) return null;
	try {
		const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		const result = schema.safeParse(decoded);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

export function encodeListingCursor(row: Listing): string {
	return encodeCursor({
		starred: row.starred,
		score: row.rankScore,
		firstSeenAt: row.firstSeenAt.toISOString(),
		id: row.id
	});
}

export function decodeListingCursor(cursor: string | null) {
	return decodeCursor(cursor, listingCursorSchema);
}

export function encodeLeadCursor(row: Lead): string {
	return encodeCursor({ score: row.rankScore, distanceMeters: row.distanceMeters, id: row.id });
}

export function decodeLeadCursor(cursor: string | null) {
	return decodeCursor(cursor, leadCursorSchema);
}

async function countRows(table: typeof listing | typeof lead, where?: SQL): Promise<number> {
	const query = db.select({ count: sql<number>`count(*)::int` }).from(table);
	const [row] = where ? await query.where(where) : await query;
	return row?.count ?? 0;
}

function listingWhere(filters: ListingFilters): SQL | undefined {
	return and(
		filters.showClosed ? undefined : eq(listing.status, 'active'),
		filters.source ? eq(listing.source, filters.source) : undefined,
		filters.verdict ? eq(listing.rankVerdict, filters.verdict) : undefined
	);
}

function listingAfter(cursor: ReturnType<typeof decodeListingCursor>): SQL | undefined {
	if (!cursor) return undefined;
	const seenAt = new Date(cursor.firstSeenAt);
	const laterWithinScore = sql`(
		${listing.firstSeenAt} < ${seenAt}
		or (${listing.firstSeenAt} = ${seenAt} and ${listing.id} < ${cursor.id})
	)`;
	const laterWithinStar =
		cursor.score === null
			? sql`${listing.rankScore} is null and ${laterWithinScore}`
			: sql`(
			${listing.rankScore} < ${cursor.score}
			or ${listing.rankScore} is null
			or (${listing.rankScore} = ${cursor.score} and ${laterWithinScore})
		)`;
	return sql`(
		${listing.starred} < ${cursor.starred}
		or (${listing.starred} = ${cursor.starred} and ${laterWithinStar})
	)`;
}

export async function getListingPage(
	filters: ListingFilters,
	cursor: string | null = null
): Promise<CursorPage<Listing>> {
	const where = listingWhere(filters);
	const decodedCursor = decodeListingCursor(cursor);
	const [rows, matchingTotal, total] = await Promise.all([
		db
			.select()
			.from(listing)
			.where(and(where, listingAfter(decodedCursor)))
			.orderBy(
				desc(listing.starred),
				sql`${listing.rankScore} desc nulls last`,
				desc(listing.firstSeenAt),
				desc(listing.id)
			)
			.limit(LIST_BATCH_SIZE + 1),
		countRows(listing, where),
		countRows(listing)
	]);
	const hasMore = rows.length > LIST_BATCH_SIZE;
	const items = hasMore ? rows.slice(0, LIST_BATCH_SIZE) : rows;
	return {
		items,
		nextCursor: hasMore ? encodeListingCursor(items.at(-1)!) : null,
		matchingTotal,
		total
	};
}

function leadWhere(filters: LeadFilters): SQL | undefined {
	return and(
		filters.onlyWithEmail ? isNotNull(lead.email) : undefined,
		filters.onlyOpen ? eq(lead.hasActivePosting, false) : undefined,
		filters.hideIgnored ? ne(lead.status, 'ignored') : undefined
	);
}

function leadAfter(cursor: ReturnType<typeof decodeLeadCursor>): SQL | undefined {
	if (!cursor) return undefined;
	const laterWithinScore = sql`(
		${lead.distanceMeters} > ${cursor.distanceMeters}
		or (${lead.distanceMeters} = ${cursor.distanceMeters} and ${lead.id} > ${cursor.id})
	)`;
	return cursor.score === null
		? sql`${lead.rankScore} is null and ${laterWithinScore}`
		: sql`(
			${lead.rankScore} < ${cursor.score}
			or ${lead.rankScore} is null
			or (${lead.rankScore} = ${cursor.score} and ${laterWithinScore})
		)`;
}

export async function getLeadPage(
	filters: LeadFilters,
	cursor: string | null = null
): Promise<CursorPage<Lead>> {
	const where = leadWhere(filters);
	const decodedCursor = decodeLeadCursor(cursor);
	const [rows, matchingTotal, total] = await Promise.all([
		db
			.select()
			.from(lead)
			.where(and(where, leadAfter(decodedCursor)))
			.orderBy(sql`${lead.rankScore} desc nulls last`, asc(lead.distanceMeters), asc(lead.id))
			.limit(LIST_BATCH_SIZE + 1),
		countRows(lead, where),
		countRows(lead)
	]);
	const hasMore = rows.length > LIST_BATCH_SIZE;
	const items = hasMore ? rows.slice(0, LIST_BATCH_SIZE) : rows;
	return {
		items,
		nextCursor: hasMore ? encodeLeadCursor(items.at(-1)!) : null,
		matchingTotal,
		total
	};
}
