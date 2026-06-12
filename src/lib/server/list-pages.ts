import {
	and,
	asc,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	lt,
	ne,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { z } from 'zod';
import {
	DEFAULT_LEAD_FILTERS,
	DEFAULT_LISTING_FILTERS,
	LEAD_SORTS,
	LIST_BATCH_SIZE,
	LISTING_SORTS,
	type CursorPage,
	type LeadFilters,
	type LeadSort,
	type ListingFilters,
	type ListingSort
} from '$lib/list-pages';
import { db } from './db';
import { lead, listing, type Lead, type Listing } from './db/schema';

const listingCursorSchema = z.discriminatedUnion('sort', [
	z.object({
		sort: z.literal('recommended'),
		starred: z.boolean(),
		score: z.number().int().nullable(),
		firstSeenAt: z.string().datetime(),
		id: z.number().int()
	}),
	z.object({
		sort: z.literal('newest'),
		starred: z.boolean(),
		firstSeenAt: z.string().datetime(),
		id: z.number().int()
	}),
	z.object({
		sort: z.literal('score'),
		starred: z.boolean(),
		score: z.number().int().nullable(),
		id: z.number().int()
	})
]);

const leadCursorSchema = z.discriminatedUnion('sort', [
	z.object({
		sort: z.literal('recommended'),
		score: z.number().int().nullable(),
		distanceMeters: z.number().int(),
		id: z.number().int()
	}),
	z.object({
		sort: z.literal('nearest'),
		distanceMeters: z.number().int(),
		id: z.number().int()
	}),
	z.object({ sort: z.literal('name'), name: z.string(), id: z.number().int() })
]);

export const listingFiltersSchema = z.object({
	source: z.string().min(1).nullable().default(DEFAULT_LISTING_FILTERS.source),
	verdict: z.enum(['strong', 'maybe', 'weak']).nullable().default(DEFAULT_LISTING_FILTERS.verdict),
	showClosed: z.boolean().default(DEFAULT_LISTING_FILTERS.showClosed),
	search: z.string().trim().max(200).default(DEFAULT_LISTING_FILTERS.search),
	sort: z.enum(LISTING_SORTS).default(DEFAULT_LISTING_FILTERS.sort),
	cursor: z.string().min(1).nullable().default(null)
});

export const leadFiltersSchema = z.object({
	onlyWithEmail: z.boolean().default(DEFAULT_LEAD_FILTERS.onlyWithEmail),
	onlyOpen: z.boolean().default(DEFAULT_LEAD_FILTERS.onlyOpen),
	hideIgnored: z.boolean().default(DEFAULT_LEAD_FILTERS.hideIgnored),
	search: z.string().trim().max(200).default(DEFAULT_LEAD_FILTERS.search),
	sort: z.enum(LEAD_SORTS).default(DEFAULT_LEAD_FILTERS.sort),
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

export function encodeListingCursor(row: Listing, sort: ListingSort): string {
	if (sort === 'newest') {
		return encodeCursor({
			sort,
			starred: row.starred,
			firstSeenAt: row.firstSeenAt.toISOString(),
			id: row.id
		});
	}
	if (sort === 'score') {
		return encodeCursor({ sort, starred: row.starred, score: row.rankScore, id: row.id });
	}
	return encodeCursor({
		sort,
		starred: row.starred,
		score: row.rankScore,
		firstSeenAt: row.firstSeenAt.toISOString(),
		id: row.id
	});
}

export function decodeListingCursor(cursor: string | null) {
	return decodeCursor(cursor, listingCursorSchema);
}

export function encodeLeadCursor(row: Lead, sort: LeadSort): string {
	if (sort === 'nearest')
		return encodeCursor({ sort, distanceMeters: row.distanceMeters, id: row.id });
	if (sort === 'name') return encodeCursor({ sort, name: row.name, id: row.id });
	return encodeCursor({
		sort,
		score: row.rankScore,
		distanceMeters: row.distanceMeters,
		id: row.id
	});
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
		filters.verdict ? eq(listing.rankVerdict, filters.verdict) : undefined,
		filters.search
			? or(
					ilike(listing.title, `%${filters.search}%`),
					ilike(listing.company, `%${filters.search}%`),
					ilike(listing.location, `%${filters.search}%`)
				)
			: undefined
	);
}

function afterStarred(cursorStarred: boolean, withinStarred: SQL): SQL {
	return cursorStarred
		? or(eq(listing.starred, false), and(eq(listing.starred, true), withinStarred))!
		: and(eq(listing.starred, false), withinStarred)!;
}

export function listingAfter(
	cursor: ReturnType<typeof decodeListingCursor>,
	sort: ListingSort
): SQL | undefined {
	if (!cursor || cursor.sort !== sort) return undefined;
	if (cursor.sort === 'newest') {
		const seenAt = new Date(cursor.firstSeenAt);
		return afterStarred(
			cursor.starred,
			or(
				lt(listing.firstSeenAt, seenAt),
				and(eq(listing.firstSeenAt, seenAt), lt(listing.id, cursor.id))
			)!
		);
	}
	if (cursor.sort === 'score') {
		const within =
			cursor.score === null
				? and(isNull(listing.rankScore), lt(listing.id, cursor.id))!
				: or(
						lt(listing.rankScore, cursor.score),
						isNull(listing.rankScore),
						and(eq(listing.rankScore, cursor.score), lt(listing.id, cursor.id))
					)!;
		return afterStarred(cursor.starred, within);
	}
	const seenAt = new Date(cursor.firstSeenAt);
	const laterWithinSeenAt = or(
		lt(listing.firstSeenAt, seenAt),
		and(eq(listing.firstSeenAt, seenAt), lt(listing.id, cursor.id))
	)!;
	const laterWithinScore =
		cursor.score === null
			? and(isNull(listing.rankScore), laterWithinSeenAt)!
			: or(
					lt(listing.rankScore, cursor.score),
					isNull(listing.rankScore),
					and(eq(listing.rankScore, cursor.score), laterWithinSeenAt)
				)!;
	return afterStarred(cursor.starred, laterWithinScore);
}

function listingOrder(sort: ListingSort): SQL[] {
	if (sort === 'newest')
		return [desc(listing.starred), desc(listing.firstSeenAt), desc(listing.id)];
	if (sort === 'score')
		return [desc(listing.starred), sql`${listing.rankScore} desc nulls last`, desc(listing.id)];
	return [
		desc(listing.starred),
		sql`${listing.rankScore} desc nulls last`,
		desc(listing.firstSeenAt),
		desc(listing.id)
	];
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
			.where(and(where, listingAfter(decodedCursor, filters.sort)))
			.orderBy(...listingOrder(filters.sort))
			.limit(LIST_BATCH_SIZE + 1),
		countRows(listing, where),
		countRows(listing)
	]);
	const hasMore = rows.length > LIST_BATCH_SIZE;
	const items = hasMore ? rows.slice(0, LIST_BATCH_SIZE) : rows;
	return {
		items,
		nextCursor: hasMore ? encodeListingCursor(items.at(-1)!, filters.sort) : null,
		matchingTotal,
		total
	};
}

function leadWhere(filters: LeadFilters): SQL | undefined {
	return and(
		filters.onlyWithEmail ? isNotNull(lead.email) : undefined,
		filters.onlyOpen ? eq(lead.hasActivePosting, false) : undefined,
		filters.hideIgnored ? ne(lead.status, 'ignored') : undefined,
		filters.search
			? or(
					ilike(lead.name, `%${filters.search}%`),
					ilike(lead.category, `%${filters.search}%`),
					ilike(lead.address, `%${filters.search}%`),
					ilike(lead.email, `%${filters.search}%`)
				)
			: undefined
	);
}

export function leadAfter(
	cursor: ReturnType<typeof decodeLeadCursor>,
	sort: LeadSort
): SQL | undefined {
	if (!cursor || cursor.sort !== sort) return undefined;
	if (cursor.sort === 'nearest') {
		return sql`(${lead.distanceMeters} > ${cursor.distanceMeters} or (${lead.distanceMeters} = ${cursor.distanceMeters} and ${lead.id} > ${cursor.id}))`;
	}
	if (cursor.sort === 'name') {
		return sql`(lower(${lead.name}) > lower(${cursor.name}) or (lower(${lead.name}) = lower(${cursor.name}) and ${lead.id} > ${cursor.id}))`;
	}
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

function leadOrder(sort: LeadSort): SQL[] {
	if (sort === 'nearest') return [asc(lead.distanceMeters), asc(lead.id)];
	if (sort === 'name') return [sql`lower(${lead.name}) asc`, asc(lead.id)];
	return [sql`${lead.rankScore} desc nulls last`, asc(lead.distanceMeters), asc(lead.id)];
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
			.where(and(where, leadAfter(decodedCursor, filters.sort)))
			.orderBy(...leadOrder(filters.sort))
			.limit(LIST_BATCH_SIZE + 1),
		countRows(lead, where),
		countRows(lead)
	]);
	const hasMore = rows.length > LIST_BATCH_SIZE;
	const items = hasMore ? rows.slice(0, LIST_BATCH_SIZE) : rows;
	return {
		items,
		nextCursor: hasMore ? encodeLeadCursor(items.at(-1)!, filters.sort) : null,
		matchingTotal,
		total
	};
}
