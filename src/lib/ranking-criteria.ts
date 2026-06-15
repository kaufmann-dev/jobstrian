import { z } from 'zod';

export type RankingCriterion = {
	id: string;
	label: string;
	description: string;
	weight: number;
};

export type RankingCriteria = RankingCriterion[];

export type RankingCriterionScore = {
	criterionId: string;
	score: number;
	reason: string;
};

export type RankingVerdict = 'strong' | 'maybe' | 'weak';

export const DEFAULT_LISTING_RANKING_CRITERIA: RankingCriteria = [
	{
		id: 'role-fit',
		label: 'Rollen-Fit',
		description: 'Wie direkt passt die ausgeschriebene Rolle zu den Zielrollen und zum Profil?',
		weight: 5
	},
	{
		id: 'qualification-fit',
		label: 'Anforderungen/Qualifikation',
		description: 'Wie gut sind Pflichtanforderungen, Ausbildung, Skills und Zertifikate erfüllt?',
		weight: 4
	},
	{
		id: 'experience',
		label: 'Erfahrung',
		description: 'Wie gut passt die vorhandene relevante Erfahrung zu Seniorität und Berufsjahren?',
		weight: 3
	},
	{
		id: 'language',
		label: 'Sprache',
		description: 'Wie gut passen Deutsch- und weitere Sprachkenntnisse zu den Anforderungen?',
		weight: 3
	},
	{
		id: 'location-work-model',
		label: 'Ort/Arbeitsmodell',
		description: 'Wie gut passen Ort, Suchort, Anfahrt, Arbeitszeit und Arbeitsmodell?',
		weight: 3
	}
];

export const DEFAULT_LEAD_RANKING_CRITERIA: RankingCriteria = [
	{
		id: 'industry-role-fit',
		label: 'Branchen-/Rollen-Fit',
		description: 'Beschäftigt ein Betrieb dieser Art plausibel Personen für die Zielrollen?',
		weight: 5
	},
	{
		id: 'profile-fit',
		label: 'Profil-Passung',
		description:
			'Wie gut passen Skills, Erfahrung, Ausbildung und Sprachen grundsätzlich zum Betrieb?',
		weight: 4
	},
	{
		id: 'distance',
		label: 'Entfernung',
		description: 'Wie günstig ist die Entfernung vom Wohnort für eine realistische Bewerbung?',
		weight: 3
	},
	{
		id: 'application-chance',
		label: 'Bewerbungschance',
		description:
			'Wie wahrscheinlich ist eine sinnvolle Initiativbewerbung trotz fehlender Ausschreibung?',
		weight: 3
	}
];

export const rankingCriterionSchema = z.object({
	id: z
		.string()
		.trim()
		.min(1, 'ID fehlt.')
		.max(80, 'ID ist zu lang.')
		.regex(/^[a-z0-9][a-z0-9_-]*$/, 'ID darf nur Kleinbuchstaben, Zahlen, _ und - enthalten.'),
	label: z.string().trim().min(1, 'Label fehlt.').max(80, 'Label ist zu lang.'),
	description: z.string().trim().max(500, 'Beschreibung ist zu lang.').default(''),
	weight: z.number().int('Gewicht muss eine ganze Zahl sein.').min(1).max(5)
});

export const rankingCriteriaSchema = z
	.array(rankingCriterionSchema)
	.min(2, 'Mindestens 2 Kriterien erforderlich.')
	.max(8, 'Maximal 8 Kriterien erlaubt.')
	.superRefine((criteria, ctx) => {
		const seen = new Set<string>();
		for (const [index, criterion] of criteria.entries()) {
			if (seen.has(criterion.id)) {
				ctx.addIssue({
					code: 'custom',
					path: [index, 'id'],
					message: 'Kriterium-ID darf nicht doppelt vorkommen.'
				});
			}
			seen.add(criterion.id);
		}
	});

export const rankingCriterionScoreSchema = z.object({
	criterionId: z.string().trim().min(1).max(80),
	score: z.number().int().min(0).max(5),
	reason: z.string().trim().max(500).default('')
});

export const rankingCriteriaAiPreviewSchema = z.object({
	listingRankingCriteria: rankingCriteriaSchema,
	leadRankingCriteria: rankingCriteriaSchema
});

export type RankingCriteriaAiPreview = z.infer<typeof rankingCriteriaAiPreviewSchema>;

export const generatedRankingCriteriaFields = {
	listingRankingCriteria: rankingCriteriaSchema,
	leadRankingCriteria: rankingCriteriaSchema
} as const;

export type GeneratedRankingCriteriaField = keyof typeof generatedRankingCriteriaFields;

const generatedRankingCriteriaFieldSchema = z.enum(
	Object.keys(generatedRankingCriteriaFields) as [
		GeneratedRankingCriteriaField,
		...GeneratedRankingCriteriaField[]
	]
);

export const rankingCriteriaPatchSchema = z
	.object({
		selected: z
			.array(generatedRankingCriteriaFieldSchema)
			.max(Object.keys(generatedRankingCriteriaFields).length),
		rankingCriteria: rankingCriteriaAiPreviewSchema.partial()
	})
	.superRefine(({ selected, rankingCriteria }, ctx) => {
		if (new Set(selected).size !== selected.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['selected'],
				message: 'Ausgewählte Felder dürfen nicht doppelt vorkommen.'
			});
		}
		for (const field of selected) {
			if (rankingCriteria[field] === undefined) {
				ctx.addIssue({
					code: 'custom',
					path: ['selected'],
					message: `Ausgewähltes Feld fehlt: ${field}`
				});
			}
		}
	});

export type RankingCriteriaPatch = z.infer<typeof rankingCriteriaPatchSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedCriterion(value: unknown): unknown {
	if (!isRecord(value)) return value;
	const id = typeof value.id === 'string' ? value.id.trim().toLocaleLowerCase('de-AT') : value.id;
	const label = typeof value.label === 'string' ? value.label.trim() : value.label;
	const description =
		typeof value.description === 'string' ? value.description.trim() : (value.description ?? '');
	const rawWeight =
		typeof value.weight === 'string' && value.weight.trim()
			? Number.parseInt(value.weight, 10)
			: value.weight;
	return { id, label, description, weight: rawWeight };
}

function normalizedCriteria(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.map(normalizedCriterion);
}

export function normalizeRankingCriteriaPreview(raw: unknown): unknown {
	const outer = isRecord(raw) ? raw : {};
	const source = isRecord(outer.rankingCriteria) ? outer.rankingCriteria : outer;
	return {
		listingRankingCriteria: normalizedCriteria(source.listingRankingCriteria),
		leadRankingCriteria: normalizedCriteria(source.leadRankingCriteria)
	};
}

export function parseRankingCriteria(value: unknown, fallback: RankingCriteria): RankingCriteria {
	const parsed = rankingCriteriaSchema.safeParse(value);
	return parsed.success ? parsed.data : fallback;
}

export function parseCriterionScores(
	raw: unknown,
	criteria: RankingCriteria
): RankingCriterionScore[] {
	const source = isRecord(raw) && Array.isArray(raw.criteria) ? raw.criteria : raw;
	const parsed = z.array(rankingCriterionScoreSchema).safeParse(source);
	if (!parsed.success) throw parsed.error;

	const expected = new Set(criteria.map((criterion) => criterion.id));
	const seen = new Set<string>();
	for (const item of parsed.data) {
		if (!expected.has(item.criterionId)) {
			throw new Error(`Unbekannte Kriterium-ID: ${item.criterionId}`);
		}
		if (seen.has(item.criterionId)) {
			throw new Error(`Doppelte Kriterium-ID: ${item.criterionId}`);
		}
		seen.add(item.criterionId);
	}
	for (const criterion of criteria) {
		if (!seen.has(criterion.id)) throw new Error(`Fehlende Kriterium-ID: ${criterion.id}`);
	}

	return parsed.data;
}

export function verdictFromScore(score: number): RankingVerdict {
	return score >= 70 ? 'strong' : score >= 40 ? 'maybe' : 'weak';
}

export function weightedRankingScore(
	criteria: RankingCriteria,
	scores: RankingCriterionScore[]
): {
	score: number;
	verdict: RankingVerdict;
	reason: string;
} {
	const byId = new Map(scores.map((item) => [item.criterionId, item]));
	const weighted = criteria.map((criterion) => {
		const score = byId.get(criterion.id)?.score ?? 0;
		return {
			criterion,
			score,
			weightedScore: score * criterion.weight,
			weightedDeduction: (5 - score) * criterion.weight
		};
	});
	const weightSum = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
	const raw = weighted.reduce((sum, item) => sum + item.weightedScore, 0);
	const score = Math.round((raw / weightSum) * 20);
	const strongest = [...weighted].sort(
		(a, b) =>
			b.weightedScore - a.weightedScore ||
			b.criterion.weight - a.criterion.weight ||
			a.criterion.label.localeCompare(b.criterion.label, 'de-AT')
	)[0];
	const deduction = [...weighted].sort(
		(a, b) =>
			b.weightedDeduction - a.weightedDeduction ||
			b.criterion.weight - a.criterion.weight ||
			a.criterion.label.localeCompare(b.criterion.label, 'de-AT')
	)[0];

	const deductionText =
		deduction.weightedDeduction > 0
			? `Größter Abzug: ${deduction.criterion.label} (${deduction.score}/5).`
			: 'Kein relevanter Abzug.';
	return {
		score,
		verdict: verdictFromScore(score),
		reason: `Stärkster Faktor: ${strongest.criterion.label} (${strongest.score}/5). ${deductionText}`
	};
}
