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
Erwähne eine konkrete Zielrolle nur, wenn sie aus den Stellen-Keywords offensichtlich ist; formuliere sonst neutral als passende Mitarbeit.
Erwähne im Text genau einmal beiläufig, dass der Lebenslauf im Anhang beiliegt ("Meinen Lebenslauf finden Sie im Anhang.").
Antworte ausschließlich als JSON: {"subject": "<Betreff>", "body": "<E-Mail-Text>"}.
Der Text soll natürlich klingen, 5-9 Sätze, mit Anrede und Grußformel, ohne Platzhalter in eckigen Klammern.`;

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
	return {
		subject: (raw.subject ?? 'Initiativbewerbung').toString().slice(0, 200),
		body: (raw.body ?? '').toString().slice(0, 4000)
	};
}
