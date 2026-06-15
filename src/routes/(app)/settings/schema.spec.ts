import { describe, expect, it } from 'vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { apiKeySchema, settingsSchema } from './schema';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '$lib/ranking-criteria';

describe('settingsSchema', () => {
	it('defaults omitted portal checkbox fields to disabled', async () => {
		expect.assertions(5);

		const form = await superValidate(new FormData(), zod4(settingsSchema));

		expect(form.valid).toBe(true);
		expect(form.data.sourceHokify).toBe(false);
		expect(form.data.sourceWillhaben).toBe(false);
		expect(form.data.sourceKarriere).toBe(false);
		expect(form.data.sourceAms).toBe(false);
	});

	it('validates configurable LLM limits', async () => {
		const data = new FormData();
		data.set('llmRequestsPerMinute', '0');
		data.set('llmMaxConcurrent', '201');
		const form = await superValidate(data, zod4(settingsSchema));

		expect(form.valid).toBe(false);
		expect(form.errors.llmRequestsPerMinute).toBeDefined();
		expect(form.errors.llmMaxConcurrent).toBeDefined();
	});

	it('validates the business radius bounds', () => {
		expect(settingsSchema.safeParse({ businessRadiusMeters: 249 }).success).toBe(false);
		expect(settingsSchema.safeParse({ businessRadiusMeters: 20001 }).success).toBe(false);
		expect(settingsSchema.safeParse({ businessRadiusMeters: 250 }).success).toBe(true);
	});

	it('rejects OSM tags outside the local catalog', () => {
		const result = settingsSchema.safeParse({
			businessOsmTags: [{ key: 'amenity', value: 'not_in_catalog' }]
		});

		expect(result.success).toBe(false);
	});

	it('normalizes duplicate keywords, cities, and OSM tags consistently', () => {
		const result = settingsSchema.safeParse({
			jobSearchKeywords: [' Pflege ', 'Pflege', 'Verkauf'],
			jobSearchLocations: [' Wien ', 'Wien', 'Graz'],
			businessOsmTags: [
				{ key: 'amenity', value: 'cafe' },
				{ key: 'amenity', value: 'cafe' },
				{ key: 'shop', value: 'bakery' }
			]
		});

		expect(result).toMatchObject({
			success: true,
			data: {
				jobSearchKeywords: ['Pflege', 'Verkauf'],
				jobSearchLocations: ['Wien', 'Graz'],
				businessOsmTags: [
					{ key: 'amenity', value: 'cafe' },
					{ key: 'shop', value: 'bakery' }
				]
			}
		});
	});

	it('validates the API key independently from other settings', () => {
		const result = apiKeySchema.safeParse({ llmApiKey: 'sk-test' });

		expect(result).toMatchObject({ success: true, data: { llmApiKey: 'sk-test' } });
	});

	it('defaults and validates ranking criteria', () => {
		expect(settingsSchema.parse({})).toMatchObject({
			listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
			leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA
		});
		expect(
			settingsSchema.safeParse({
				listingRankingCriteria: [
					{ id: 'fit', label: 'Fit', description: '', weight: 5 },
					{ id: 'fit', label: 'Noch ein Fit', description: '', weight: 3 }
				]
			}).success
		).toBe(false);
	});

	it('validates bounded nested CV profile entries', async () => {
		const result = settingsSchema.safeParse({
			skills: Array.from({ length: 101 }, (_, index) => `Skill ${index}`),
			workExperience: [
				{
					position: 'A'.repeat(501),
					employer: '',
					location: '',
					startDate: '',
					endDate: '',
					description: ''
				}
			]
		});

		expect(result.success).toBe(false);
	});
});
