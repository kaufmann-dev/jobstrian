import { z } from 'zod';
import { importableProfileFields } from '#lib/profile.js';

export interface LlmResponseSchema {
	name: string;
	schema: z.ZodType;
}

const criterion = z.strictObject({
	id: z.string(),
	label: z.string(),
	description: z.string(),
	weight: z.number().int()
});

export const rankingResponse: LlmResponseSchema = {
	name: 'ranking',
	schema: z.strictObject({
		criteria: z.array(
			z.strictObject({
				criterionId: z.string(),
				score: z.number().int().min(0).max(5),
				reason: z.string()
			})
		)
	})
};
export const draftResponse: LlmResponseSchema = {
	name: 'email_draft',
	schema: z.strictObject({ subject: z.string(), body: z.string() })
};
export const emailQualityResponse: LlmResponseSchema = {
	name: 'email_review',
	schema: z.strictObject({
		decisions: z.array(
			z.strictObject({
				id: z.string(),
				status: z.enum(['accepted', 'rejected']),
				reason: z.string()
			})
		)
	})
};
export const profileResponse: LlmResponseSchema = {
	name: 'cv_profile',
	schema: z.strictObject(
		Object.fromEntries(
			Object.entries(importableProfileFields).map(([key, schema]) => [key, schema.nullable()])
		)
	)
};
export const searchConfigResponse: LlmResponseSchema = {
	name: 'search_config',
	schema: z.strictObject({
		jobSearchKeywords: z.array(z.string()).nullable(),
		jobSearchLocations: z.array(z.string()).nullable(),
		businessOsmTags: z.array(z.strictObject({ key: z.string(), value: z.string() })).nullable()
	})
};
export const rankingCriteriaResponse: LlmResponseSchema = {
	name: 'ranking_criteria',
	schema: z.strictObject({
		listingRankingCriteria: z.array(criterion),
		leadRankingCriteria: z.array(criterion)
	})
};
export const verificationResponse: LlmResponseSchema = {
	name: 'verification',
	schema: z.strictObject({ ok: z.literal(true) })
};

/** Provider grammars enforce structure; application validators enforce business constraints. */
export function responseJsonSchema(response: LlmResponseSchema): Record<string, unknown> {
	const unsupported = new Set([
		'$schema',
		'minimum',
		'maximum',
		'minLength',
		'maxLength',
		'minItems',
		'maxItems'
	]);
	const convert = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(convert);
		if (!value || typeof value !== 'object') return value;
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !unsupported.has(key))
				.map(([key, entry]) => [key, convert(entry)])
		);
	};
	return convert(z.toJSONSchema(response.schema)) as Record<string, unknown>;
}
