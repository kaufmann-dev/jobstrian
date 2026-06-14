import { describe, expect, it } from 'vitest';
import { profilePatchSchema, profilePreviewSchema } from './profile';

describe('profile import schemas', () => {
	it('accepts a partial preview and strips unsupported fields', () => {
		const result = profilePreviewSchema.parse({
			skills: ['Latte Art'],
			experienceYears: null,
			rankingNotes: 'must not be imported'
		});

		expect(result).toEqual({ skills: ['Latte Art'], experienceYears: null });
	});

	it('requires every selected field to be present in the preview', () => {
		const result = profilePatchSchema.safeParse({
			selected: ['skills', 'homeAddress'],
			profile: { skills: ['Latte Art'] }
		});

		expect(result.success).toBe(false);
	});
});
