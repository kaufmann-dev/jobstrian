import { superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/settings';
import { getCvMeta } from '$lib/server/cv';
import { apiKeySchema, settingsSchema } from './schema';
import type { Settings } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

function settingsFormData(s: Settings) {
	const enabled = new Set(s.enabledSources);

	return {
		fullName: s.fullName,
		phone: s.phone,
		email: s.email,
		profileText: s.profileText,
		languages: s.languages,
		skills: s.skills,
		workExperience: s.workExperience,
		educationHistory: s.educationHistory,
		certifications: s.certifications,
		germanLevel: s.germanLevel,
		experienceYears: s.experienceYears,
		educationStatus: s.educationStatus,
		availability: s.availability,
		listingRankingCriteria: s.listingRankingCriteria,
		leadRankingCriteria: s.leadRankingCriteria,
		homeAddress: s.homeAddress,
		jobSearchKeywords: s.jobSearchKeywords,
		jobSearchLocations: s.jobSearchLocations,
		businessOsmTags: s.businessOsmTags,
		businessRadiusMeters: s.businessRadiusMeters,
		sourceHokify: enabled.has('hokify'),
		sourceWillhaben: enabled.has('willhaben'),
		sourceKarriere: enabled.has('karriere'),
		sourceAms: enabled.has('ams'),
		llmBaseUrl: s.llmBaseUrl,
		llmModel: s.llmModel,
		llmRequestsPerMinute: s.llmRequestsPerMinute,
		llmMaxConcurrent: s.llmMaxConcurrent,
		llmApiKey: ''
	};
}

async function settingsForm(s: Settings) {
	return superValidate(settingsFormData(s), zod4(settingsSchema));
}

export const load: PageServerLoad = async () => {
	const s = await getSettings();
	const form = await settingsForm(s);
	return {
		form,
		hasApiKey: Boolean(s.llmApiKey),
		hasLlmConfig: Boolean(s.llmBaseUrl && s.llmModel),
		homeLocationVerified: Boolean(
			s.homeLocationProvider &&
			s.homeLocationId &&
			s.homeCity &&
			s.homeLat != null &&
			s.homeLon != null
		),
		cv: await getCvMeta()
	};
};

export const actions: Actions = {
	saveApiKey: async ({ request }) => {
		const keyForm = await superValidate(request, zod4(apiKeySchema));
		if (!keyForm.valid) {
			const form = await settingsForm(await getSettings());
			form.valid = false;
			form.data.llmApiKey = keyForm.data.llmApiKey;
			form.errors.llmApiKey = keyForm.errors.llmApiKey;
			return fail(400, { form });
		}

		const current = await getSettings();
		const updated = keyForm.data.llmApiKey
			? await updateSettings({ llmApiKey: keyForm.data.llmApiKey })
			: current;
		return {
			form: await settingsForm(updated),
			hasApiKey: Boolean(updated.llmApiKey),
			saved: 'apiKey' as const
		};
	}
};
