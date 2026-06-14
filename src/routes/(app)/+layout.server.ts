import { getSettings } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings = await getSettings();
	return {
		user: locals.user,
		configured: Boolean(settings.llmBaseUrl && settings.llmModel),
		hasHome: Boolean(
			settings.homeLocationProvider &&
			settings.homeLocationId &&
			settings.homeCity.trim() &&
			settings.homeLat != null &&
			settings.homeLon != null
		),
		hasSearchConfig: settings.jobSearchKeywords.length > 0 && settings.businessOsmTags.length > 0
	};
};
