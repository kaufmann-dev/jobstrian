import type { Settings, Listing, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import type { LlmLimiter } from './limiter';
import { osmBusinessTagLabel } from '$lib/search-config';

export const RANK_PROMPT_VERSION = 'rank-v2-structured-profile';

export interface RankResult {
	score: number; // 0-100
	verdict: 'strong' | 'maybe' | 'weak';
	reason: string;
}

export function profileBlock(s: Settings): string {
	const exp =
		s.experienceYears != null
			? `${s.experienceYears} Jahr${s.experienceYears === 1 ? '' : 'e'} relevante Erfahrung`
			: null;
	const parts = [
		s.profileText && `Profil: ${s.profileText}`,
		s.jobSearchKeywords.length && `Gesuchte Stellen-Keywords: ${s.jobSearchKeywords.join(', ')}`,
		s.businessOsmTags.length &&
			`Ausgewählte Betriebskategorien: ${s.businessOsmTags.map(osmBusinessTagLabel).join(', ')}`,
		exp,
		s.germanLevel && `Deutschniveau: ${s.germanLevel}`,
		s.languages.length && `Sprachen gesamt: ${s.languages.join(', ')}`,
		s.skills.length && `Kenntnisse: ${s.skills.join(', ')}`,
		s.educationStatus && `Ausbildung: ${s.educationStatus}`,
		s.availability && `Verfügbarkeit: ${s.availability}`,
		s.homeAddress && `Wohnort: ${s.homeAddress} (kurze Anfahrt ist ein Plus)`,
		s.jobSearchLocations.length
			? `Job-Suchorte: ${s.jobSearchLocations.join(', ')}`
			: s.homeCity && `Abgeleiteter Job-Suchort: ${s.homeCity}`,
		s.workExperience.length &&
			`Berufserfahrung:\n${s.workExperience
				.map(
					(item) =>
						`- ${[item.position, item.employer, item.location, [item.startDate, item.endDate].filter(Boolean).join(' bis ')].filter(Boolean).join(' | ')}${item.description ? `: ${item.description}` : ''}`
				)
				.join('\n')}`,
		s.educationHistory.length &&
			`Ausbildungsverlauf:\n${s.educationHistory
				.map(
					(item) =>
						`- ${[item.qualification, item.field, item.institution, item.location, [item.startDate, item.endDate].filter(Boolean).join(' bis ')].filter(Boolean).join(' | ')}${item.description ? `: ${item.description}` : ''}`
				)
				.join('\n')}`,
		s.certifications.length &&
			`Zertifikate:\n${s.certifications
				.map(
					(item) =>
						`- ${[item.name, item.issuer, item.date].filter(Boolean).join(' | ')}${item.description ? `: ${item.description}` : ''}`
				)
				.join('\n')}`,
		s.rankingNotes && `Zusätzliche Gewichtung: ${s.rankingNotes}`
	].filter(Boolean);
	return parts.join('\n');
}

const SYSTEM = `Du bist ein Recruiting-Assistent. Bewerte, wie gut eine konkrete Stelle oder eine Initiativbewerbung bei einem Betrieb zum Profil des Bewerbers passt.
Gleiche die ANFORDERUNGEN der Stelle gegen das Profil ab und gewichte vor allem:
- Sprachniveau: Verlangt die Stelle ein höheres Deutschniveau als der Bewerber hat (z.B. Stelle "Deutsch C1/fließend", Bewerber A2), senke den Score deutlich und nenne es. Andere Sprachen als Plus werten.
- Erfahrung: Vergleiche geforderte Berufsjahre mit der vorhandenen Erfahrung. Weniger Erfahrung als gefordert => niedriger.
- Ausbildung/Status: Studium/Schulabschluss und Verfügbarkeit berücksichtigen.
- Kenntnisse und detaillierter Verlauf: Relevante Skills, konkrete Berufsstationen, Ausbildung und Zertifikate gegen die Anforderungen abgleichen.
- Rolle, Kategorie & Ort: Passt die Stelle oder Initiativbewerbung zu den konfigurierten Stellen-Keywords, zur Betriebskategorie, zur Entfernung und zum Profil?
Wenn die Stellenbeschreibung keine Anforderung nennt, nimm an, dass sie erfüllbar ist (nicht bestrafen).
Antworte ausschließlich als JSON-Objekt:
{"score": <0-100>, "verdict": "strong"|"maybe"|"weak", "reason": "<kurze deutsche Begründung, max 2 Sätze, nenne den ausschlaggebenden Faktor>"}
score 70-100 => "strong", 40-69 => "maybe", 0-39 => "weak".`;

function clampResult(raw: Partial<RankResult>): RankResult {
	let score = Math.round(Number(raw.score));
	if (!Number.isFinite(score)) score = 0;
	score = Math.max(0, Math.min(100, score));
	const verdict: RankResult['verdict'] = score >= 70 ? 'strong' : score >= 40 ? 'maybe' : 'weak';
	return { score, verdict, reason: (raw.reason ?? '').toString().slice(0, 500) };
}

export function buildListingRankingPrompt(settings: Settings, listing: Listing): string {
	return `BEWERBER:\n${profileBlock(settings)}\n\nSTELLE:
Titel: ${listing.title}
Unternehmen: ${listing.company ?? 'unbekannt'}
Ort: ${listing.location ?? 'unbekannt'}
Gefunden über Keyword: ${listing.discoveryKeyword ?? 'unbekannt'}
Gefunden für Suchort: ${listing.discoveryCity ?? 'unbekannt'}
Gehalt: ${listing.salary ?? 'unbekannt'}
Beschreibung: ${(listing.description ?? '').slice(0, 2000)}`;
}

export function buildLeadRankingPrompt(settings: Settings, lead: Lead): string {
	const targetRole = settings.jobSearchKeywords.length
		? settings.jobSearchKeywords.join(', ')
		: 'keine eindeutige Zielrolle konfiguriert';
	const matchedTags = lead.matchedOsmTags.length
		? lead.matchedOsmTags.map((tag) => tag.label).join(', ')
		: 'keine gespeicherten OSM-Kategorien';
	return `BEWERBER:\n${profileBlock(settings)}\n\nBETRIEB (potenzielle Initiativbewerbung):
Name: ${lead.name}
Art: ${lead.category ?? 'Betrieb'}
Passende OSM-Kategorien: ${matchedTags}
Zielrolle aus Stellen-Keywords: ${targetRole}
Adresse: ${lead.address ?? 'unbekannt'}
Entfernung: ${lead.distanceMeters} m
Bewerte, wie gut eine Initiativbewerbung mit den konfigurierten Stellen-Keywords, den Betriebskategorien, der Entfernung und dem Profil bei diesem Betrieb passt.`;
}

export async function rankListing(
	cfg: LlmConfig,
	settings: Settings,
	listing: Listing,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<RankResult> {
	const user = buildListingRankingPrompt(settings, listing);
	const raw = await chatJson<Partial<RankResult>>(
		cfg,
		[
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: user }
		],
		{ limiter, signal }
	);
	return clampResult(raw);
}

export async function rankLead(
	cfg: LlmConfig,
	settings: Settings,
	lead: Lead,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<RankResult> {
	const user = buildLeadRankingPrompt(settings, lead);
	const raw = await chatJson<Partial<RankResult>>(
		cfg,
		[
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: user }
		],
		{ limiter, signal }
	);
	return clampResult(raw);
}
