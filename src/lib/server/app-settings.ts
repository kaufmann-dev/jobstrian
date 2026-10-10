import { eq } from 'drizzle-orm';
import { db } from './db';
import { appSettings, type AppSettings } from './db/schema';

/** The single app-wide settings row (id = 1), created on first access. */
export async function getAppSettings(): Promise<AppSettings> {
	const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
	if (rows.length > 0) return rows[0];
	const inserted = await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing().returning();
	if (inserted.length > 0) return inserted[0];
	const again = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
	return again[0];
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
	await getAppSettings();
	const updated = await db.update(appSettings).set(patch).where(eq(appSettings.id, 1)).returning();
	return updated[0];
}
