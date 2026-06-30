import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA,
	normalizeRankingCriteriaPreview,
	rankingCriteriaAiPreviewSchema,
	rankingCriteriaPatchSchema,
	type RankingCriteriaPatch,
	type RankingCriteriaAiPreview
} from '$lib/ranking-criteria';
import type { Settings } from './db/schema';
import { chatJson, getLlmConfig, LlmHttpError } from './llm/client';
import { LlmLimiter } from './llm/limiter';
import { profileBlock } from './llm/rank';
import { getSettings, updateSettings } from './settings';

export class RankingCriteriaAiError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
		this.name = 'RankingCriteriaAiError';
	}
}

export function isRankingCriteriaAiError(error: unknown): error is RankingCriteriaAiError {
	return (
		error instanceof RankingCriteriaAiError ||
		(error instanceof Error &&
			error.name === 'RankingCriteriaAiError' &&
			'status' in error &&
			typeof error.status === 'number')
	);
}

const RANKING_CRITERIA_SYSTEM = `Du erstellst deterministische Bewertungskriterien für eine Jobsuche in Österreich.
Antworte ausschließlich mit einem JSON-Objekt mit exakt diesen Feldern:
listingRankingCriteria, leadRankingCriteria.

Regeln:
- listingRankingCriteria bewertet konkrete ausgeschriebene Stellen.
- leadRankingCriteria bewertet Betriebe für Initiativbewerbungen ohne konkrete Ausschreibung.
- Jede Liste enthält 2 bis 8 Kriterien.
- Jedes Kriterium hat die technisch vorgegebenen JSON-Felder id, label, description und weight.
- id ist eine stabile interne englische Kennung aus Kleinbuchstaben, Zahlen, "-" oder "_".
- label enthält eine kurze deutsche Bezeichnung mit maximal 80 Zeichen.
- description enthält eine konkrete deutsche Bewertungsanweisung mit maximal 500 Zeichen.
- weight ist eine ganze Zahl von 1 bis 5 und gibt die Gewichtung an.
- Gewichte drücken Wichtigkeit aus; 5 ist am wichtigsten.
- Nutze keine doppelten IDs innerhalb derselben Liste.
- Kriterien sollen zum Nutzerwunsch, Profil und Suchkonfiguration passen.`;

function currentContext(settings: Settings): string {
	return [
		`PROFIL:\n${profileBlock(settings) || 'Kein Profil erfasst.'}`,
		`SUCHKEYWORDS: ${settings.jobSearchKeywords.join(', ') || 'keine'}`,
		`SUCHORTE: ${settings.jobSearchLocations.join(', ') || 'keine'}`,
		`BETRIEBSRADIUS: ${settings.businessRadiusMeters} m`,
		`AKTUELLE STELLEN-KRITERIEN:\n${JSON.stringify(settings.listingRankingCriteria, null, 2)}`,
		`AKTUELLE BETRIEBS-KRITERIEN:\n${JSON.stringify(settings.leadRankingCriteria, null, 2)}`,
		`FALLBACK STELLEN-KRITERIEN:\n${JSON.stringify(DEFAULT_LISTING_RANKING_CRITERIA, null, 2)}`,
		`FALLBACK BETRIEBS-KRITERIEN:\n${JSON.stringify(DEFAULT_LEAD_RANKING_CRITERIA, null, 2)}`
	].join('\n\n');
}

export async function createRankingCriteriaPreview(
	intent: string
): Promise<RankingCriteriaAiPreview> {
	const trimmedIntent = intent.trim();
	if (!trimmedIntent) {
		throw new RankingCriteriaAiError('Beschreibe kurz, wonach Treffer bewertet werden sollen.');
	}
	if (trimmedIntent.length > 3000) {
		throw new RankingCriteriaAiError('Die Beschreibung ist zu lang.', 413);
	}

	const settings = await getSettings();
	const cfg = await getLlmConfig(settings).catch(() => {
		throw new RankingCriteriaAiError('Die KI-Konfiguration ist unvollständig.', 409);
	});
	const limiter = new LlmLimiter({
		requestsPerMinute: settings.llmRequestsPerMinute,
		maxConcurrent: settings.llmMaxConcurrent
	});

	let raw: unknown;
	try {
		raw = await chatJson<unknown>(
			cfg,
			[
				{ role: 'system', content: RANKING_CRITERIA_SYSTEM },
				{
					role: 'user',
					content: `NUTZERWUNSCH:\n${trimmedIntent}\n\nKONTEXT:\n${currentContext(settings)}`
				}
			],
			{ limiter, temperature: 0.1 }
		);
	} catch (error) {
		if (error instanceof LlmHttpError && (error.status === 401 || error.status === 403)) {
			throw new RankingCriteriaAiError(
				'KI-Anmeldung fehlgeschlagen. Prüfe den gespeicherten API-Key.',
				502
			);
		}
		throw error;
	}

	const parsed = rankingCriteriaAiPreviewSchema.safeParse(normalizeRankingCriteriaPreview(raw));
	if (!parsed.success) {
		console.error('Ungültige LLM-Antwort für Bewertungskriterien', parsed.error.issues);
		throw new RankingCriteriaAiError('Die KI-Antwort enthält keine gültigen Kriterien.', 502);
	}
	return parsed.data;
}

export function selectedRankingCriteriaPatch(input: RankingCriteriaPatch): Partial<Settings> {
	const patch: Partial<Settings> = {};
	for (const field of input.selected) {
		const value = input.rankingCriteria[field];
		if (value !== undefined) Object.assign(patch, { [field]: value });
	}
	return patch;
}

export async function applyRankingCriteriaPatch(input: unknown): Promise<Settings> {
	const parsed = rankingCriteriaPatchSchema.safeParse(input);
	if (!parsed.success) {
		throw new RankingCriteriaAiError('Die ausgewählten Bewertungskriterien sind ungültig.');
	}
	await getSettings();
	return updateSettings(selectedRankingCriteriaPatch(parsed.data));
}
