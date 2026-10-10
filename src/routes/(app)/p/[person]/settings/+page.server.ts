import { superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { getPerson } from '#lib/server/people.js';
import { requirePerson } from '#lib/server/request-person.js';
import { listConnections } from '#lib/server/llm/connections.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import { getCvMeta } from '#lib/server/cv.js';
import {
	applicationEmailDomainConfig,
	saveApplicationEmailSettings
} from '#lib/server/application-email/config.js';
import { llmStatusFor } from '#lib/server/llm/connections.js';
import { resendSettingsSchema, settingsSchema } from '#lib/settings-schema.js';
import type { Person } from '#lib/server/db/schema.js';
import type { Actions, PageServerLoad } from './$types';

function settingsFormData(s: Person) {
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
		llmModelId: s.llmModelId,
		resendApiKey: '',
		resendDomain: s.resendDomain,
		resendFromLocalPart: s.resendFromLocalPart,
		resendFromName: s.resendFromName || s.fullName,
		resendReplyTo: s.resendReplyTo || s.email,
		resendWebhookSecret: '',
		applicationEmailDailyLimit: s.applicationEmailDailyLimit,
		applicationEmailSendOnWeekends: s.applicationEmailSendOnWeekends
	};
}

async function settingsForm(s: Person) {
	return superValidate(settingsFormData(s), zod4(settingsSchema));
}

export const load: PageServerLoad = async ({ params }) => {
	const s = await requirePerson(params);
	const form = await settingsForm(s);
	const [llmStatus, connections, appSettings, cv] = await Promise.all([
		llmStatusFor(s),
		listConnections(),
		getAppSettings(),
		getCvMeta(s.id)
	]);
	return {
		form,
		llmStatus,
		// Saved models to choose from, grouped by connection (no API keys).
		llmOptions: connections.map((connection) => ({
			id: connection.id,
			name: connection.name,
			models: connection.models.map((model) => ({
				id: model.id,
				modelId: model.modelId,
				verified: model.verified
			}))
		})),
		defaultLlmModelId: appSettings.defaultLlmModelId,
		homeLocationVerified: Boolean(
			s.homeLocationProvider &&
			s.homeLocationId &&
			s.homeCity &&
			s.homeLat != null &&
			s.homeLon != null
		),
		applicationEmailDomain: applicationEmailDomainConfig(s),
		webhookPath: `/api/webhooks/resend/${s.slug}`,
		cv
	};
};

export const actions: Actions = {
	saveResendSettings: async ({ request, params }) => {
		const person = await requirePerson(params);
		const resendForm = await superValidate(request, zod4(resendSettingsSchema));
		if (!resendForm.valid) {
			const form = await settingsForm(await getPerson(person.id));
			form.valid = false;
			Object.assign(form.errors, resendForm.errors);
			Object.assign(form.data, resendForm.data);
			return fail(400, { form });
		}

		const updated = await saveApplicationEmailSettings(person.id, resendForm.data);
		return {
			form: await settingsForm(updated),
			applicationEmailDomain: applicationEmailDomainConfig(updated),
			saved: 'resendSettings' as const
		};
	}
};
