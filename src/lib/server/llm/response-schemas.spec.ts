import { describe, expect, it } from 'vitest';
import {
	profileResponse,
	responseJsonSchema,
	rankingResponse,
	verificationResponse
} from './response-schemas';

describe('response schemas', () => {
	it('requires nullable extraction fields and forbids unknown fields', () => {
		const schema = responseJsonSchema(profileResponse);
		const properties = schema.properties as Record<string, unknown>;
		expect(schema.required).toEqual(Object.keys(properties));
		expect(schema.additionalProperties).toBe(false);
		expect(
			profileResponse.schema.safeParse(
				Object.fromEntries(Object.keys(properties).map((key) => [key, null]))
			).success
		).toBe(true);
		expect(profileResponse.schema.safeParse({}).success).toBe(false);
	});
	it('keeps local score bounds while omitting unsupported wire constraints', () => {
		expect(JSON.stringify(responseJsonSchema(rankingResponse))).not.toMatch(/minimum|maximum/);
		expect(
			rankingResponse.schema.safeParse({
				criteria: [{ criterionId: 'fit', score: 6, reason: 'bad' }]
			}).success
		).toBe(false);
		expect(verificationResponse.schema.safeParse({ ok: false }).success).toBe(false);
	});
});
