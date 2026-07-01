import { superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/settings';
import { getCvMeta } from '$lib/server/cv';
import {
	applicationEmailDomainConfig,
	saveApplicationEmailSettings
} from '$lib/server/application-email/config';
import { llmConfigStatus } from '$lib/server/llm/verify';
import { apiKeySchema, resendSettingsSchema, settingsSchema } from './schema';
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
		llmApiKey: '',
		resendApiKey: '',
		resendDomain: s.resendDomain,
		resendFromLocalPart: s.resendFromLocalPart,
		resendFromName: s.resendFromName || s.fullName,
		resendReplyTo: s.resendReplyTo || s.email,
		resendWebhookSecret: '',
		applicationEmailDailyLimit: s.applicationEmailDailyLimit
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
		llmStatus: llmConfigStatus(s),
		homeLocationVerified: Boolean(
			s.homeLocationProvider &&
			s.homeLocationId &&
			s.homeCity &&
			s.homeLat != null &&
			s.homeLon != null
		),
		applicationEmailDomain: applicationEmailDomainConfig(s),
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
			? await updateSettings({
					llmApiKey: keyForm.data.llmApiKey,
					llmVerified: false,
					llmVerifiedAt: null
				})
			: current;
		return {
			form: await settingsForm(updated),
			llmStatus: llmConfigStatus(updated),
			saved: 'apiKey' as const
		};
	},
	saveResendSettings: async ({ request }) => {
		const resendForm = await superValidate(request, zod4(resendSettingsSchema));
		if (!resendForm.valid) {
			const form = await settingsForm(await getSettings());
			form.valid = false;
			Object.assign(form.errors, resendForm.errors);
			Object.assign(form.data, resendForm.data);
			return fail(400, { form });
		}

		const updated = await saveApplicationEmailSettings(resendForm.data);
		return {
			form: await settingsForm(updated),
			applicationEmailDomain: applicationEmailDomainConfig(updated),
			saved: 'resendSettings' as const
		};
	}
};
