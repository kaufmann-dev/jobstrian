import type { Settings, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import { profileBlock } from './rank';
import type { LlmLimiter } from './limiter';

export const DRAFT_PROMPT_VERSION = 'draft-cold-email-v3-signature';

export interface EmailDraft {
	subject: string;
	body: string;
}

const SYSTEM = `Du schreibst eine kurze, höfliche Initiativbewerbung auf Deutsch an einen Betrieb.
Der Bewerber sucht eine Stelle passend zu den Stellen-Keywords und seinem Profil. Nenne eine konkrete Zielrolle nur, wenn sie aus den Keywords klar hervorgeht, sonst formuliere neutral als passende Mitarbeit.
Komm schnell zum Punkt und schreib konkret. Keine Werbefloskeln und keine leeren Standardsätze (z.B. kein "mit großem Interesse", kein "ich hoffe, diese Nachricht erreicht Sie gut").
Erwähne genau einmal beiläufig, dass der Lebenslauf im Anhang liegt.
Schließe mit Grußformel und dem Namen des Absenders.
Antworte ausschließlich als JSON: {"subject": "<Betreff>", "body": "<E-Mail-Text>"}.
4-7 Sätze, mit Anrede, ohne Platzhalter in eckigen Klammern.`;

export function targetRoleLine(settings: Settings): string {
	return settings.jobSearchKeywords.length
		? `Zielrolle aus Stellen-Keywords: ${settings.jobSearchKeywords.join(', ')}`
		: 'Zielrolle: nicht eindeutig; neutral als passende Mitarbeit formulieren';
}

export function buildColdEmailPrompt(settings: Settings, lead: Lead): string {
	const matchedTags = lead.matchedOsmTags.length
		? lead.matchedOsmTags.map((tag) => tag.label).join(', ')
		: 'keine gespeicherten OSM-Kategorien';
	return `BEWERBERPROFIL:
${profileBlock(settings) || 'Bewerber sucht eine passende Stelle in Österreich.'}
${targetRoleLine(settings)}
Absender (mit diesem Namen unterschreiben): ${settings.fullName || 'Name nicht angegeben'}

BETRIEB:
Name: ${lead.name}
Art: ${lead.category ?? 'Betrieb'}
Passende OSM-Kategorien: ${matchedTags}
Adresse: ${lead.address ?? 'unbekannt'}
Entfernung vom Wohnort: ${lead.distanceMeters} m

Schreibe eine passende Initiativbewerbung per E-Mail an diesen Betrieb. Der Lebenslauf liegt der E-Mail als Anhang bei.`;
}

export async function draftColdEmail(
	cfg: LlmConfig,
	settings: Settings,
	lead: Lead,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<EmailDraft> {
	const user = buildColdEmailPrompt(settings, lead);

	const raw = await chatJson<Partial<EmailDraft>>(
		cfg,
		[
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: user }
		],
		{ temperature: 0.6, limiter, signal }
	);
	const body = (raw.body ?? '').toString().trim().slice(0, 4000);
	if (!body) {
		throw new Error('LLM lieferte keinen E-Mail-Text für den Entwurf.');
	}
	return {
		subject: (raw.subject ?? 'Initiativbewerbung').toString().trim().slice(0, 200) || 'Initiativbewerbung',
		body
	};
}
