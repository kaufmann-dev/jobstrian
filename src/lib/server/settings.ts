import { eq } from 'drizzle-orm';
import { db } from './db';
import { settings, type Settings } from './db/schema';

export const DEFAULT_ROLE_KEYWORDS = [
	'Barista',
	'Kellner',
	'Kellnerin',
	'Servicekraft',
	'Servicemitarbeiter',
	'Service Hilfskraft'
];

export const ALL_SOURCES = ['hokify', 'willhaben', 'karriere', 'ams'] as const;

// hokify gates its search results behind interactions that don't expose a
// stable endpoint, so it is off by default (the adapter stays for later use).
export const DEFAULT_SOURCES = ['willhaben', 'karriere', 'ams'];

/** Get the single settings row, creating it with defaults on first access. */
export async function getSettings(): Promise<Settings> {
	const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
	if (rows.length > 0) return rows[0];

	const inserted = await db
		.insert(settings)
		.values({
			id: 1,
			roleKeywords: DEFAULT_ROLE_KEYWORDS,
			enabledSources: [...DEFAULT_SOURCES],
			radiusMeters: 2000
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
