import type { Settings, Listing, Lead } from '../db/schema';
import { chatJson, type LlmConfig } from './client';
import type { LlmLimiter } from './limiter';
import { osmBusinessTagLabel } from '$lib/search-config';
import {
	parseCriterionScores,
	weightedRankingScore,
	type RankFactor,
	type RankingCriteria,
	type RankingCriterionScore
} from '$lib/ranking-criteria';

export const RANK_PROMPT_VERSION = 'rank-v5-weighted-criteria-de';

export interface RankResult {
	score: number; // 0-100
	verdict: 'strong' | 'maybe' | 'weak';
	reason: string;
	factors: RankFactor[];
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
				.join('\n')}`
	].filter(Boolean);
	return parts.join('\n');
}

const SCORE_SCALE = `Nutze die gesamte Skala von 0 bis 5, aber bewerte weder absichtlich streng noch großzügig.
Eine Bewertung von 0 bedeutet: Für dieses Kriterium gibt es keinen ausdrücklichen Beleg für eine Passung oder es besteht ein ausdrücklicher Widerspruch. Vergib nicht allein aus Strenge eine 0.
0 = kein ausdrücklicher Beleg für eine Passung oder ausdrücklicher Widerspruch
1 = sehr schwache Passung; nur vage oder indirekte Belege
2 = teilweise Passung; einige relevante Belege, aber wichtige Lücken
3 = plausible Passung; genügend Belege, um sie in Betracht zu ziehen
4 = starke Passung; die meisten wichtigen Anforderungen sind klar erfüllt
5 = ausgezeichnete Passung; direkte Übereinstimmung mit nahezu allen wichtigen Anforderungen`;

export const LISTING_SYSTEM = `Du bist ein Recruiting-Assistent. Bewerte, wie gut eine konkrete, ausgeschriebene Stelle zum Profil des Bewerbers passt.
Gleiche die ANFORDERUNGEN der Stelle gegen das Profil und die konfigurierten Kriterien ab.
Wenn die Stellenbeschreibung keine Anforderung nennt, nimm an, dass sie erfüllbar ist (nicht bestrafen).
${SCORE_SCALE}
Antworte ausschließlich als JSON-Objekt:
{"criteria":[{"criterionId":"<ID aus den Kriterien>","score":<0-5>,"reason":"<kurze deutsche Begründung>"}]}
Die englischen JSON-Feldnamen sind technisch vorgegeben. Gib jedes konfigurierte Kriterium genau einmal zurück. Gib keine Gesamtpunktzahl, kein Gesamturteil und keine Gesamtbegründung zurück.`;

export const LEAD_SYSTEM = `Du bist ein Recruiting-Assistent. Bewerte, wie sinnvoll und erfolgversprechend eine Initiativbewerbung (unaufgeforderte Bewerbung) des Bewerbers bei diesem Betrieb ist.
WICHTIG: Es gibt KEINE ausgeschriebene Stelle und KEINE konkreten Anforderungen. Bewerte NICHT gegen Stellenanforderungen und erfinde keine.
Sprachniveau und Berufsjahre NICHT als harte Anforderung bestrafen — es gibt keine Ausschreibung, gegen die man durchfallen könnte; nutze sie nur als grobe Plausibilität.
${SCORE_SCALE}
Antworte ausschließlich als JSON-Objekt:
{"criteria":[{"criterionId":"<ID aus den Kriterien>","score":<0-5>,"reason":"<kurze deutsche Begründung>"}]}
Die englischen JSON-Feldnamen sind technisch vorgegeben. Gib jedes konfigurierte Kriterium genau einmal zurück. Gib keine Gesamtpunktzahl, kein Gesamturteil und keine Gesamtbegründung zurück.`;

function criteriaBlock(criteria: RankingCriteria): string {
	return criteria
		.map(
			(criterion) =>
				`- Kriterium-ID: ${criterion.id}\n  Bezeichnung: ${criterion.label}\n  Gewicht: ${criterion.weight}\n  Beschreibung: ${criterion.description || 'Keine Zusatzbeschreibung'}`
		)
		.join('\n');
}

function rankedResult(raw: unknown, criteria: RankingCriteria): RankResult {
	const scores = parseCriterionScores(raw, criteria);
	return weightedRankingScore(criteria, scores);
}

export function buildListingRankingPrompt(settings: Settings, listing: Listing): string {
	return `BEWERBER:\n${profileBlock(settings)}\n\nKRITERIEN FÜR STELLEN:
${criteriaBlock(settings.listingRankingCriteria)}

STELLE:
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
	return `BEWERBER:\n${profileBlock(settings)}\n\nKRITERIEN FÜR BETRIEBE:
${criteriaBlock(settings.leadRankingCriteria)}

BETRIEB (potenzielle Initiativbewerbung):
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
	const raw = await chatJson<{ criteria: RankingCriterionScore[] }>(
		cfg,
		[
			{ role: 'system', content: LISTING_SYSTEM },
			{ role: 'user', content: user }
		],
		{ limiter, signal }
	);
	return rankedResult(raw, settings.listingRankingCriteria);
}

export async function rankLead(
	cfg: LlmConfig,
	settings: Settings,
	lead: Lead,
	limiter: LlmLimiter,
	signal?: AbortSignal
): Promise<RankResult> {
	const user = buildLeadRankingPrompt(settings, lead);
	const raw = await chatJson<{ criteria: RankingCriterionScore[] }>(
		cfg,
		[
			{ role: 'system', content: LEAD_SYSTEM },
			{ role: 'user', content: user }
		],
		{ limiter, signal }
	);
	return rankedResult(raw, settings.leadRankingCriteria);
}
