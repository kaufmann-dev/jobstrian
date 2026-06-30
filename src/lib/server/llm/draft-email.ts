import type { Settings, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import { profileBlock } from './rank';
import type { LlmLimiter } from './limiter';

export const DRAFT_PROMPT_VERSION = 'draft-cold-email-v6';

export interface EmailDraft {
	subject: string;
	body: string;
}

const SYSTEM = `Du schreibst eine kurze, höfliche Initiativbewerbung auf Deutsch an einen Betrieb.
Der Bewerber sucht eine Stelle passend zu den Stellen-Keywords und seinem Profil. Nenne eine konkrete Zielrolle nur, wenn sie aus den Keywords klar hervorgeht, sonst formuliere neutral als passende Mitarbeit.
Komm schnell zum Punkt und schreib konkret. Keine Werbefloskeln und keine leeren Standardsätze (z.B. kein "mit großem Interesse", kein "ich hoffe, diese Nachricht erreicht Sie gut").
Keine Gedankenstriche (– oder —) als Satzzeichen. Formuliere Einschübe als eigenen Satz oder mit Komma.
Schreib in natürlichem, ungezwungenem Deutsch. Keine Amts- oder Behördensprache (z.B. nicht "mitwirken", sondern "arbeiten").
Erwähne genau einmal beiläufig vor der Grußformel, dass der Lebenslauf im Anhang liegt.
Nutze Nähe nur natürlich: "in der Nähe", "direkt in der Nähe" oder "gut erreichbar". Nenne keine exakten Meterangaben, keine Zahlen zur Entfernung und keine genaue Wohnadresse des Bewerbers.
Der body muss exakt diese Struktur haben:
Anrede in einer eigenen Zeile.
Leerzeile.
Ein Hauptabsatz mit 4-6 kurzen, natürlichen Sätzen.
Leerzeile.
Mit freundlichen Grüßen
<Absendername>
Der body muss mit dem Absendernamen enden. Nach dem Absendernamen kommt kein weiterer Text, keine Anweisung, kein Kommentar, kein Platzhalter und kein Komma.
Antworte ausschließlich als JSON: {"subject": "<Betreff>", "body": "<E-Mail-Text>"}.
Keine Platzhalter in eckigen Klammern. Variiere Satzlänge und Satzbau.`;

const SIGNOFF = 'Mit freundlichen Grüßen';
const MAX_DRAFT_ATTEMPTS = 2;

function draftProfileBlock(settings: Settings): string {
	const block = profileBlock(settings);
	if (!settings.homeAddress) return block;
	return block
		.split('\n')
		.filter((line) => !line.startsWith('Wohnort: '))
		.join('\n');
}

function proximityLabel(distanceMeters: number): string {
	if (!Number.isFinite(distanceMeters)) return 'Nähe zum Wohnort: unbekannt';
	if (distanceMeters <= 300) return 'Nähe zum Wohnort: direkt in der Nähe';
	if (distanceMeters <= 1000) return 'Nähe zum Wohnort: in der Nähe';
	if (distanceMeters <= 3000) return 'Nähe zum Wohnort: gut erreichbar';
	return 'Nähe zum Wohnort: im Suchradius';
}

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
${draftProfileBlock(settings) || 'Bewerber sucht eine passende Stelle in Österreich.'}
${targetRoleLine(settings)}
Absender (mit diesem Namen unterschreiben): ${senderName(settings)}

BETRIEB:
Name: ${lead.name}
Art: ${lead.category ?? 'Betrieb'}
Passende OSM-Kategorien: ${matchedTags}
Adresse: ${lead.address ?? 'unbekannt'}
${proximityLabel(lead.distanceMeters)}

Schreibe eine passende Initiativbewerbung per E-Mail an diesen Betrieb. Der Lebenslauf liegt der E-Mail als Anhang bei.`;
}

function senderName(settings: Settings): string {
	return settings.fullName.trim() || 'Name nicht angegeben';
}

function compactLine(value: string): string {
	return value.trim().replace(/[ \t]+/g, ' ');
}

function normalizeBodyText(value: string): string {
	return value.replace(/\r\n?/g, '\n').split('\n').map(compactLine).join('\n').trim();
}

function lastSignoffMatch(value: string): RegExpExecArray | null {
	const pattern = /Mit[ \t]+freundlichen[ \t]+Grüßen/gu;
	let match: RegExpExecArray | null = null;
	let current: RegExpExecArray | null;
	while ((current = pattern.exec(value))) {
		match = current;
	}
	return match;
}

function hasExactDraftStructure(body: string, sender: string): boolean {
	const lines = body.split('\n');
	return (
		lines.length === 6 &&
		lines[0].trim().length > 0 &&
		lines[1] === '' &&
		lines[2].trim().length > 0 &&
		lines[3] === '' &&
		lines[4] === SIGNOFF &&
		lines[5] === sender
	);
}

function guardDraftBody(rawBody: unknown, sender: string): string | null {
	const normalized = normalizeBodyText((rawBody ?? '').toString());
	if (!normalized) return null;

	const signoff = lastSignoffMatch(normalized);
	if (!signoff) return null;

	const beforeSignoff = normalized.slice(0, signoff.index).trim();
	const afterSignoff = normalized.slice(signoff.index + signoff[0].length).trim();
	const senderLines = afterSignoff.split('\n').map(compactLine).filter(Boolean);
	if (senderLines.length !== 1 || senderLines[0] !== sender) return null;

	const contentLines = beforeSignoff.split('\n').map(compactLine).filter(Boolean);
	if (contentLines.length < 2) return null;

	const [salutation, ...paragraphLines] = contentLines;
	const paragraph = paragraphLines.join(' ');
	const body = `${salutation}\n\n${paragraph}\n\n${SIGNOFF}\n${sender}`;
	if (body.length > 4000) return null;
	return hasExactDraftStructure(body, sender) ? body : null;
}

export async function draftColdEmail(
	cfg: LlmConfig,
	settings: Settings,
	lead: Lead,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<EmailDraft> {
	const user = buildColdEmailPrompt(settings, lead);
	const sender = senderName(settings);
	let lastSubject = 'Initiativbewerbung';
	for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
		const raw = await chatJson<Partial<EmailDraft>>(
			cfg,
			[
				{ role: 'system', content: SYSTEM },
				{ role: 'user', content: user }
			],
			{ temperature: 0.6, limiter, signal }
		);
		lastSubject =
			(raw.subject ?? 'Initiativbewerbung').toString().trim().slice(0, 200) || 'Initiativbewerbung';
		const body = guardDraftBody(raw.body, sender);
		if (body) {
			return {
				subject: lastSubject,
				body
			};
		}
	}
	throw new Error(`LLM lieferte keinen korrekt formatierten E-Mail-Entwurf für "${lastSubject}".`);
}
