import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA,
	normalizeRankingCriteriaPreview,
	parseCriterionScores,
	rankingCriteriaAiPreviewSchema,
	rankingCriteriaSchema,
	weightedRankingScore
} from './ranking-criteria';

describe('rankingCriteriaSchema', () => {
	it('accepts the default listing and lead criteria', () => {
		expect(rankingCriteriaSchema.safeParse(DEFAULT_LISTING_RANKING_CRITERIA).success).toBe(true);
		expect(rankingCriteriaSchema.safeParse(DEFAULT_LEAD_RANKING_CRITERIA).success).toBe(true);
	});

	it('rejects lists outside the allowed length', () => {
		expect(rankingCriteriaSchema.safeParse([DEFAULT_LISTING_RANKING_CRITERIA[0]]).success).toBe(
			false
		);
		expect(
			rankingCriteriaSchema.safeParse([
				...DEFAULT_LISTING_RANKING_CRITERIA,
				{ id: 'one', label: 'One', description: '', weight: 1 },
				{ id: 'two', label: 'Two', description: '', weight: 1 },
				{ id: 'three', label: 'Three', description: '', weight: 1 },
				{ id: 'four', label: 'Four', description: '', weight: 1 }
			]).success
		).toBe(false);
	});

	it('rejects invalid weights and duplicate criterion ids', () => {
		expect(
			rankingCriteriaSchema.safeParse([
				{ id: 'fit', label: 'Fit', description: '', weight: 0 },
				{ id: 'fit', label: 'Fit 2', description: '', weight: 6 }
			]).success
		).toBe(false);
	});
});

describe('ranking criteria AI output', () => {
	it('normalizes wrapped criteria and numeric string weights', () => {
		const normalized = normalizeRankingCriteriaPreview({
			rankingCriteria: {
				listingRankingCriteria: [
					{ id: ' Role-Fit ', label: ' Rolle ', description: ' Passt ', weight: '5' },
					{ id: 'language', label: 'Sprache', description: '', weight: 2 }
				],
				leadRankingCriteria: [
					{ id: 'industry', label: 'Branche', description: '', weight: 5 },
					{ id: 'distance', label: 'Entfernung', description: '', weight: 3 }
				]
			}
		});

		const parsed = rankingCriteriaAiPreviewSchema.parse(normalized);
		expect(parsed.listingRankingCriteria[0]).toMatchObject({
			id: 'role-fit',
			label: 'Rolle',
			description: 'Passt',
			weight: 5
		});
		expect(parsed.leadRankingCriteria[0]).toMatchObject({
			id: 'industry',
			label: 'Branche',
			weight: 5
		});
	});

	it('rejects AI scores with missing, duplicate, unknown, or out-of-range criteria', () => {
		const criteria = DEFAULT_LEAD_RANKING_CRITERIA.slice(0, 2);

		expect(() =>
			parseCriterionScores(
				{ criteria: [{ criterionId: criteria[0].id, score: 3, reason: '' }] },
				criteria
			)
		).toThrow(`Fehlende Kriterium-ID: ${criteria[1].id}`);
		expect(() =>
			parseCriterionScores(
				{
					criteria: [
						{ criterionId: criteria[0].id, score: 3, reason: '' },
						{ criterionId: criteria[0].id, score: 4, reason: '' }
					]
				},
				criteria
			)
		).toThrow(`Doppelte Kriterium-ID: ${criteria[0].id}`);
		expect(() =>
			parseCriterionScores(
				{
					criteria: [
						{ criterionId: criteria[0].id, score: 3, reason: '' },
						{ criterionId: 'unknown', score: 4, reason: '' }
					]
				},
				criteria
			)
		).toThrow('Unbekannte Kriterium-ID: unknown');
		expect(() =>
			parseCriterionScores(
				{
					criteria: [
						{ criterionId: criteria[0].id, score: 6, reason: '' },
						{ criterionId: criteria[1].id, score: 4, reason: '' }
					]
				},
				criteria
			)
		).toThrow();
	});
});

describe('weightedRankingScore', () => {
	it('computes the final score deterministically from 0-5 scores and 1-5 weights', () => {
		const criteria = [
			{ id: 'important', label: 'Wichtig', description: '', weight: 5 },
			{ id: 'minor', label: 'Nebensache', description: '', weight: 1 }
		];

		expect(
			weightedRankingScore(criteria, [
				{ criterionId: 'important', score: 5, reason: '' },
				{ criterionId: 'minor', score: 0, reason: '' }
			])
		).toEqual({
			score: 83,
			verdict: 'strong',
			reason: 'Stärkster Faktor: Wichtig (5/5). Größter Abzug: Nebensache (0/5).'
		});
	});
});
