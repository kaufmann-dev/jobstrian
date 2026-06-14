import { expect, it } from 'vitest';
import type { Settings } from '../db/schema';
import { profileBlock } from './rank';

it('includes skills and detailed CV history in the ranking profile', () => {
	const profile = profileBlock({
		skills: ['Latte Art'],
		workExperience: [
			{
				position: 'Barista',
				employer: 'Cafe Test',
				location: 'Wien',
				startDate: '2024',
				endDate: '2025',
				description: 'Espresso und Service'
			}
		],
		educationHistory: [],
		certifications: [{ name: 'HACCP', issuer: 'Test', date: '2025', description: '' }],
		languages: [],
		profileText: '',
		germanLevel: '',
		experienceYears: null,
		educationStatus: '',
		availability: '',
		homeAddress: '',
		jobSearchKeywords: [],
		jobSearchLocations: [],
		businessOsmTags: [],
		businessRadiusMeters: 5000,
		rankingNotes: ''
	} as unknown as Settings);

	expect(profile).toContain('Kenntnisse: Latte Art');
	expect(profile).toContain('Barista | Cafe Test | Wien | 2024 bis 2025');
	expect(profile).toContain('Zertifikate:');
});
