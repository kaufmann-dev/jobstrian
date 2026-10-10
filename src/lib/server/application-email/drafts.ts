import { eq } from 'drizzle-orm';
import { db } from '../db';
import { lead, type Lead } from '../db/schema';
import { getPerson } from '../people';
import { LlmNotConfiguredError } from '../llm/client';
import { getLlmConfig, getLlmLimiter } from '../llm/connections';
import { draftColdEmail } from '../llm/draft-email';
import { draftContextHash, leadContentHash, shouldDraftLead } from '../llm/fingerprints';

export type DraftRefreshResult = {
	lead: Lead;
	warning: string | null;
};

export async function ensureLeadDraft(leadId: number): Promise<DraftRefreshResult> {
	const [row] = await db.select().from(lead).where(eq(lead.id, leadId)).limit(1);
	if (!row) throw new Error('Betrieb nicht gefunden.');
	if (!row.email) return { lead: row, warning: null };

	const settings = await getPerson(row.personId);
	let cfg;
	try {
		cfg = await getLlmConfig(settings);
	} catch (err) {
		if (err instanceof LlmNotConfiguredError) {
			return {
				lead: row,
				warning: 'E-Mail gespeichert, aber KI-Konfiguration fehlt für den Entwurf.'
			};
		}
		throw err;
	}

	const contentHash = row.contentHash ?? leadContentHash(row);
	const contextHash = draftContextHash(settings, cfg);
	if (!shouldDraftLead(row, contextHash, contentHash)) return { lead: row, warning: null };

	const limiter = getLlmLimiter(cfg);
	try {
		const draft = await draftColdEmail(cfg, settings, row, limiter);
		const [updated] = await db
			.update(lead)
			.set({
				draftSubject: draft.subject,
				draftBody: draft.body,
				draftContentHash: contentHash,
				draftContextHash: contextHash,
				contentHash
			})
			.where(eq(lead.id, leadId))
			.returning();
		return { lead: updated ?? row, warning: null };
	} catch (err) {
		console.error('[application-email] Entwurfserstellung fehlgeschlagen:', err);
		return {
			lead: row,
			warning: 'E-Mail gespeichert, aber der KI-Entwurf konnte nicht erstellt werden.'
		};
	}
}
