import { eq } from 'drizzle-orm';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '$lib/ranking-criteria';
import { DEFAULT_BUSINESS_OSM_TAGS, DEFAULT_JOB_SEARCH_KEYWORDS } from '$lib/search-config';
import { db } from './db';
import { settings, type Settings } from './db/schema';

export const ALL_SOURCES = ['hokify', 'willhaben', 'karriere', 'ams'] as const;

export const DEFAULT_SOURCES = ['hokify', 'willhaben', 'karriere', 'ams'];

/** Get the single settings row, creating it with defaults on first access. */
export async function getSettings(): Promise<Settings> {
	const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	if (rows.length > 0) return rows[0];

	const inserted = await db
		.insert(settings)
		.values({
			id: 1,
			jobSearchKeywords: DEFAULT_JOB_SEARCH_KEYWORDS,
			businessOsmTags: DEFAULT_BUSINESS_OSM_TAGS,
			listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
			leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
			enabledSources: [...DEFAULT_SOURCES],
			businessRadiusMeters: 5000
		})
		.onConflictDoNothing()
		.returning();

	if (inserted.length > 0) return inserted[0];
	// Lost an insert race — read the existing row.
	const again = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	return again[0];
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
	await getSettings(); // ensure the row exists
	const updated = await db.update(settings).set(patch).where(eq(settings.id, 1)).returning();
	return updated[0];
}
