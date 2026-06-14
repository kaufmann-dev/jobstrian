import type { Settings, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import { profileBlock } from './rank';
import type { LlmLimiter } from './limiter';

export const DRAFT_PROMPT_VERSION = 'draft-cold-email-v2-search-config';

export interface EmailDraft {
	subject: string;
	body: string;
}

const SYSTEM = `Du schreibst eine kurze, höfliche Initiativbewerbung (Kaltakquise) auf Deutsch an einen Betrieb.
Der Bewerber sucht eine Stelle passend zu den konfigurierten Stellen-Keywords und seinem Profil.
Erwähne im Text genau einmal beiläufig, dass der Lebenslauf im Anhang beiliegt ("Meinen Lebenslauf finden Sie im Anhang.").
Antworte ausschließlich als JSON: {"subject": "<Betreff>", "body": "<E-Mail-Text>"}.
Der Text soll natürlich klingen, 5-9 Sätze, mit Anrede und Grußformel, ohne Platzhalter in eckigen Klammern.`;

export async function draftColdEmail(
	cfg: LlmConfig,
	settings: Settings,
	lead: Lead,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<EmailDraft> {
	const user = `BEWERBERPROFIL:
${profileBlock(settings) || 'Bewerber sucht eine passende Stelle in Österreich.'}

BETRIEB:
Name: ${lead.name}
Art: ${lead.category ?? 'Betrieb'}
Adresse: ${lead.address ?? 'unbekannt'}
Entfernung vom Wohnort: ${lead.distanceMeters} m

Schreibe eine passende Initiativbewerbung per E-Mail an diesen Betrieb. Der Lebenslauf liegt der E-Mail als Anhang bei.`;

	const raw = await chatJson<Partial<EmailDraft>>(
		cfg,
		[
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: user }
		],
		{ temperature: 0.6, limiter, signal }
	);
	return {
		subject: (raw.subject ?? 'Initiativbewerbung').toString().slice(0, 200),
		body: (raw.body ?? '').toString().slice(0, 4000)
	};
}
