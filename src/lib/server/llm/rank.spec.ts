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
		roleKeywords: [],
		languages: [],
		profileText: '',
		germanLevel: '',
		experienceYears: null,
		educationStatus: '',
		workPermit: false,
		availability: '',
		homeAddress: '',
		rankingNotes: ''
	} as unknown as Settings);

	expect(profile).toContain('Kenntnisse: Latte Art');
	expect(profile).toContain('Barista | Cafe Test | Wien | 2024 bis 2025');
	expect(profile).toContain('Zertifikate:');
});
