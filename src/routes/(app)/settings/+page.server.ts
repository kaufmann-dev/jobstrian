import { setError, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings, ALL_SOURCES } from '$lib/server/settings';
import { getCvMeta } from '$lib/server/cv';
import { apiKeySchema, settingsSchema } from './schema';
import { resolveHomeAddressSave } from './settings-save';
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
		rankingNotes: s.rankingNotes,
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

async function saveSettings(request: Request) {
	const form = await superValidate(request, zod4(settingsSchema));
	if (!form.valid) return fail(400, { form });

	const current = await getSettings();
	const data = form.data;
	const enabledSources = ALL_SOURCES.filter((src) => {
		if (src === 'hokify') return data.sourceHokify;
		if (src === 'willhaben') return data.sourceWillhaben;
		if (src === 'karriere') return data.sourceKarriere;
		return data.sourceAms;
	});

	const homeAddressSave = await resolveHomeAddressSave(current, data.homeAddress);
	if (!homeAddressSave.ok) return setError(form, 'homeAddress', homeAddressSave.message);
	form.data.homeAddress = homeAddressSave.homeAddress;

	const updated = await updateSettings({
		fullName: data.fullName,
		phone: data.phone,
		email: data.email,
		profileText: data.profileText,
		languages: data.languages,
		skills: data.skills,
		workExperience: data.workExperience,
		educationHistory: data.educationHistory,
		certifications: data.certifications,
		germanLevel: data.germanLevel,
		experienceYears: data.experienceYears,
		educationStatus: data.educationStatus,
		availability: data.availability,
		rankingNotes: data.rankingNotes,
		homeAddress: homeAddressSave.homeAddress,
		...('homeCity' in homeAddressSave ? { homeCity: homeAddressSave.homeCity } : {}),
		jobSearchKeywords: data.jobSearchKeywords,
		jobSearchLocations: data.jobSearchLocations,
		businessOsmTags: data.businessOsmTags,
		businessRadiusMeters: data.businessRadiusMeters,
		enabledSources,
		llmBaseUrl: data.llmBaseUrl,
		llmModel: data.llmModel,
		llmRequestsPerMinute: data.llmRequestsPerMinute,
		llmMaxConcurrent: data.llmMaxConcurrent,
		...('homeLat' in homeAddressSave ? { homeLat: homeAddressSave.homeLat } : {}),
		...('homeLon' in homeAddressSave ? { homeLon: homeAddressSave.homeLon } : {})
	});

	const responseForm = await settingsForm(updated);
	// Autosave must neither persist nor clear a key that is currently being edited.
	responseForm.data.llmApiKey = data.llmApiKey;
	return { form: responseForm, saved: 'settings' as const };
}

export const load: PageServerLoad = async () => {
	const s = await getSettings();
	const form = await settingsForm(s);
	return {
		form,
		hasApiKey: Boolean(s.llmApiKey),
		hasLlmConfig: Boolean(s.llmBaseUrl && s.llmModel),
		cv: await getCvMeta()
	};
};

export const actions: Actions = {
	autosave: async ({ request }) => saveSettings(request),
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
