import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings, ALL_SOURCES } from '$lib/server/settings';
import { getCvMeta } from '$lib/server/cv';
import { settingsSchema } from './schema';
import type { Settings } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

function splitList(value: string): string[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function settingsFormData(s: Settings) {
	const enabled = new Set(s.enabledSources);

	return {
		profileText: s.profileText,
		roleKeywords: s.roleKeywords.join(', '),
		languages: s.languages.join(', '),
		germanLevel: s.germanLevel,
		experienceYears: s.experienceYears,
		educationStatus: s.educationStatus,
		workPermit: s.workPermit,
		availability: s.availability,
		rankingNotes: s.rankingNotes,
		homeAddress: s.homeAddress,
		radiusMeters: s.radiusMeters,
		sourceHokify: enabled.has('hokify'),
		sourceWillhaben: enabled.has('willhaben'),
		sourceKarriere: enabled.has('karriere'),
		sourceAms: enabled.has('ams'),
		llmBaseUrl: s.llmBaseUrl,
		llmModel: s.llmModel,
		llmApiKey: ''
	};
}

async function settingsForm(s: Settings) {
	return superValidate(settingsFormData(s), zod4(settingsSchema));
}

export const load: PageServerLoad = async () => {
	const s = await getSettings();
	const form = await settingsForm(s);
	return { form, hasApiKey: Boolean(s.llmApiKey), cv: await getCvMeta() };
};

export const actions: Actions = {
	default: async ({ request }) => {
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

		const addressChanged = data.homeAddress.trim() !== current.homeAddress.trim();

		const updated = await updateSettings({
			profileText: data.profileText,
			roleKeywords: splitList(data.roleKeywords),
			languages: splitList(data.languages),
			germanLevel: data.germanLevel,
			experienceYears: data.experienceYears,
			educationStatus: data.educationStatus,
			workPermit: data.workPermit,
			availability: data.availability,
			rankingNotes: data.rankingNotes,
			homeAddress: data.homeAddress,
			radiusMeters: data.radiusMeters,
			enabledSources,
			llmBaseUrl: data.llmBaseUrl,
			llmModel: data.llmModel,
			// Only overwrite the key when a new value was entered.
			...(data.llmApiKey ? { llmApiKey: data.llmApiKey } : {}),
			// Re-geocode on next run if the address changed.
			...(addressChanged ? { homeLat: null, homeLon: null } : {})
		});

		return {
			form: await settingsForm(updated),
			hasApiKey: Boolean(updated.llmApiKey)
		};
	}
};
