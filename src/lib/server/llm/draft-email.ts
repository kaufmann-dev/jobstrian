import type { Settings, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import { profileBlock } from './rank';
import type { LlmLimiter } from './limiter';

export const DRAFT_PROMPT_VERSION = 'draft-cold-email-v1';

export interface EmailDraft {
	subject: string;
	body: string;
}

const SYSTEM = `Du schreibst eine kurze, höfliche Initiativbewerbung (Kaltakquise) auf Deutsch an einen Gastronomiebetrieb.
Der Bewerber sucht eine Stelle im Service/als Barista in der Nähe seines Wohnorts.
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
${profileBlock(settings) || 'Erfahrene Service-/Barista-Kraft, sucht Stelle in Wien.'}

BETRIEB:
Name: ${lead.name}
Art: ${lead.category ?? 'Gastronomie'}
Adresse: ${lead.address ?? 'Wien'}
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
