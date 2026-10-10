import { eq } from 'drizzle-orm';
import { db } from './db';
import { cv, type Cv } from './db/schema';

export type CvMeta = Pick<Cv, 'filename' | 'mimeType' | 'size' | 'uploadedAt'>;

/** CV metadata without the blob (cheap to load on every settings render). */
export async function getCvMeta(personId: number): Promise<CvMeta | null> {
	const rows = await db
		.select({
			filename: cv.filename,
			mimeType: cv.mimeType,
			size: cv.size,
			uploadedAt: cv.uploadedAt
		})
		.from(cv)
		.where(eq(cv.personId, personId))
		.limit(1);
	return rows[0] ?? null;
}

/** Full CV including the blob (only for download and attachments). */
export async function getCvData(personId: number): Promise<Cv | null> {
	const rows = await db.select().from(cv).where(eq(cv.personId, personId)).limit(1);
	return rows[0] ?? null;
}

export async function saveCv(
	personId: number,
	filename: string,
	mimeType: string,
	data: Buffer
): Promise<void> {
	await db
		.insert(cv)
		.values({ personId, filename, mimeType, size: data.length, data, uploadedAt: new Date() })
		.onConflictDoUpdate({
			target: cv.personId,
			set: { filename, mimeType, size: data.length, data, uploadedAt: new Date() }
		});
}

export async function deleteCv(personId: number): Promise<void> {
	await db.delete(cv).where(eq(cv.personId, personId));
}
