import {
	and,
	asc,
	desc,
	eq,
	gt,
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
		sort: z.enum(['score-asc', 'score-desc']),
		value: z.number().int().nullable(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['title-asc', 'title-desc', 'source-asc', 'source-desc']),
		value: z.string(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['company-asc', 'company-desc', 'location-asc', 'location-desc']),
		value: z.string().nullable(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['posted-asc', 'posted-desc']),
		value: z.string().datetime().nullable(),
		id: z.number().int()
	})
]);

const leadCursorSchema = z.discriminatedUnion('sort', [
	z.object({
		sort: z.literal('recommended'),
		score: z.number().int().nullable(),
		starred: z.boolean(),
		distanceMeters: z.number().int(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['score-asc', 'score-desc']),
		value: z.number().int().nullable(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['name-asc', 'name-desc']),
		value: z.string(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['distance-asc', 'distance-desc']),
		value: z.number().int(),
		id: z.number().int()
	}),
	z.object({
		sort: z.enum(['status-asc', 'status-desc']),
		value: z.enum(['new', 'contacted', 'ignored']),
		hasActivePosting: z.boolean(),
		id: z.number().int()
	})
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
	if (sort === 'recommended')
		return encodeCursor({
			sort,
			starred: row.starred,
			score: row.rankScore,
			firstSeenAt: row.firstSeenAt.toISOString(),
			id: row.id
		});
	const value = {
		'score-asc': row.rankScore,
		'score-desc': row.rankScore,
		'title-asc': row.title,
		'title-desc': row.title,
		'company-asc': row.company,
		'company-desc': row.company,
		'location-asc': row.location,
		'location-desc': row.location,
		'source-asc': row.source,
		'source-desc': row.source,
		'posted-asc': row.postedAt?.toISOString() ?? null,
		'posted-desc': row.postedAt?.toISOString() ?? null
	}[sort];
	return encodeCursor({ sort, value, id: row.id });
}

export function decodeListingCursor(cursor: string | null) {
	return decodeCursor(cursor, listingCursorSchema);
}

export function encodeLeadCursor(row: Lead, sort: LeadSort): string {
	if (sort === 'recommended')
		return encodeCursor({
			sort,
			score: row.rankScore,
			starred: row.starred,
			distanceMeters: row.distanceMeters,
			id: row.id
		});
	const value = {
		'score-asc': row.rankScore,
		'score-desc': row.rankScore,
		'name-asc': row.name,
		'name-desc': row.name,
		'distance-asc': row.distanceMeters,
		'distance-desc': row.distanceMeters,
		'status-asc': row.status,
		'status-desc': row.status
	}[sort];
	return encodeCursor({ sort, value, hasActivePosting: row.hasActivePosting, id: row.id });
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

function nullableAfter(
	column: SQL,
	value: string | number | Date | null,
	id: number,
	direction: 'asc' | 'desc'
): SQL {
	const comparison = direction === 'asc' ? sql`${column} > ${value}` : sql`${column} < ${value}`;
	return value === null
		? sql`${column} is null and ${listing.id} > ${id}`
		: sql`(${comparison} or ${column} is null or (${column} = ${value} and ${listing.id} > ${id}))`;
}

function textAfter(column: SQL, value: string, id: number, direction: 'asc' | 'desc'): SQL {
	const comparison =
		direction === 'asc'
			? sql`lower(${column}) > lower(${value})`
			: sql`lower(${column}) < lower(${value})`;
	return sql`(${comparison} or (lower(${column}) = lower(${value}) and ${listing.id} > ${id}))`;
}

export function listingAfter(
	cursor: ReturnType<typeof decodeListingCursor>,
	sort: ListingSort
): SQL | undefined {
	if (!cursor || cursor.sort !== sort) return undefined;
	if (cursor.sort === 'recommended') {
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
	const direction = cursor.sort.endsWith('-asc') ? 'asc' : 'desc';
	if (cursor.sort.startsWith('score-'))
		return nullableAfter(
			sql`${listing.rankScore}`,
			cursor.value as number | null,
			cursor.id,
			direction
		);
	if (cursor.sort.startsWith('company-'))
		return nullableAfter(
			sql`lower(${listing.company})`,
			cursor.value as string | null,
			cursor.id,
			direction
		);
	if (cursor.sort.startsWith('location-'))
		return nullableAfter(
			sql`lower(${listing.location})`,
			cursor.value as string | null,
			cursor.id,
			direction
		);
	if (cursor.sort.startsWith('posted-'))
		if (cursor.value === null) return and(isNull(listing.postedAt), gt(listing.id, cursor.id))!;
		else {
			const value = new Date(cursor.value as string);
			const comparison =
				direction === 'asc' ? gt(listing.postedAt, value) : lt(listing.postedAt, value);
			return or(
				comparison,
				isNull(listing.postedAt),
				and(eq(listing.postedAt, value), gt(listing.id, cursor.id))
			)!;
		}
	if (cursor.sort.startsWith('title-'))
		return textAfter(sql`${listing.title}`, cursor.value as string, cursor.id, direction);
	return textAfter(sql`${listing.source}`, cursor.value as string, cursor.id, direction);
}

function listingOrder(sort: ListingSort): SQL[] {
	if (sort === 'recommended')
		return [
			desc(listing.starred),
			sql`${listing.rankScore} desc nulls last`,
			desc(listing.firstSeenAt),
			desc(listing.id)
		];
	const direction = sort.endsWith('-asc') ? sql`asc` : sql`desc`;
	const column = {
		'score-asc': sql`${listing.rankScore}`,
		'score-desc': sql`${listing.rankScore}`,
		'title-asc': sql`lower(${listing.title})`,
		'title-desc': sql`lower(${listing.title})`,
		'company-asc': sql`lower(${listing.company})`,
		'company-desc': sql`lower(${listing.company})`,
		'location-asc': sql`lower(${listing.location})`,
		'location-desc': sql`lower(${listing.location})`,
		'source-asc': sql`lower(${listing.source})`,
		'source-desc': sql`lower(${listing.source})`,
		'posted-asc': sql`${listing.postedAt}`,
		'posted-desc': sql`${listing.postedAt}`
	}[sort];
	return [sql`${column} ${direction} nulls last`, asc(listing.id)];
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

function leadAfterStarred(cursorStarred: boolean, withinStarred: SQL): SQL {
	return cursorStarred
		? or(eq(lead.starred, false), and(eq(lead.starred, true), withinStarred))!
		: and(eq(lead.starred, false), withinStarred)!;
}
export function leadAfter(
	cursor: ReturnType<typeof decodeLeadCursor>,
	sort: LeadSort
): SQL | undefined {
	if (!cursor || cursor.sort !== sort) return undefined;
	if (cursor.sort === 'recommended') {
		const laterWithinScore = sql`(
			${lead.distanceMeters} > ${cursor.distanceMeters}
			or (${lead.distanceMeters} = ${cursor.distanceMeters} and ${lead.id} > ${cursor.id})
		)`;
		return leadAfterStarred(
			cursor.starred,
			cursor.score === null
				? sql`${lead.rankScore} is null and ${laterWithinScore}`
				: sql`(
				${lead.rankScore} < ${cursor.score}
				or ${lead.rankScore} is null
				or (${lead.rankScore} = ${cursor.score} and ${laterWithinScore})
			)`
		);
	}
	const direction = cursor.sort.endsWith('-asc') ? sql`>` : sql`<`;
	if (cursor.sort.startsWith('score-')) {
		const value = cursor.value as number | null;
		return value === null
			? sql`${lead.rankScore} is null and ${lead.id} > ${cursor.id}`
			: sql`(${lead.rankScore} ${direction} ${value} or ${lead.rankScore} is null or (${lead.rankScore} = ${value} and ${lead.id} > ${cursor.id}))`;
	}
	if (cursor.sort.startsWith('name-'))
		return sql`(lower(${lead.name}) ${direction} lower(${cursor.value as string}) or (lower(${lead.name}) = lower(${cursor.value as string}) and ${lead.id} > ${cursor.id}))`;
	if (cursor.sort.startsWith('distance-'))
		return sql`(${lead.distanceMeters} ${direction} ${cursor.value as number} or (${lead.distanceMeters} = ${cursor.value as number} and ${lead.id} > ${cursor.id}))`;
	const statusOrder = sql`case ${lead.status} when 'new' then 1 when 'contacted' then 2 else 3 end`;
	const postingOrder = sql`case when ${lead.hasActivePosting} then 1 else 0 end`;
	if (!('hasActivePosting' in cursor)) return undefined;
	const statusValue = { new: 1, contacted: 2, ignored: 3 }[cursor.value as Lead['status']];
	const postingValue = cursor.hasActivePosting ? 1 : 0;
	return sql`(
		${statusOrder} ${direction} ${statusValue}
		or (${statusOrder} = ${statusValue} and ${postingOrder} ${direction} ${postingValue})
		or (${statusOrder} = ${statusValue} and ${postingOrder} = ${postingValue} and ${lead.id} > ${cursor.id})
	)`;
}

function leadOrder(sort: LeadSort): SQL[] {
	if (sort === 'recommended')
		return [
			desc(lead.starred),
			sql`${lead.rankScore} desc nulls last`,
			asc(lead.distanceMeters),
			asc(lead.id)
		];
	const direction = sort.endsWith('-asc') ? sql`asc` : sql`desc`;
	if (sort.startsWith('score-'))
		return [sql`${lead.rankScore} ${direction} nulls last`, asc(lead.id)];
	if (sort.startsWith('name-')) return [sql`lower(${lead.name}) ${direction}`, asc(lead.id)];
	if (sort.startsWith('distance-')) return [sql`${lead.distanceMeters} ${direction}`, asc(lead.id)];
	return [
		sql`case ${lead.status} when 'new' then 1 when 'contacted' then 2 else 3 end ${direction}`,
		sql`case when ${lead.hasActivePosting} then 1 else 0 end ${direction}`,
		asc(lead.id)
	];
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
