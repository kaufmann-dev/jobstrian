import { getSettings } from '$lib/server/settings';
import { hasSavedHomeLocation } from '$lib/server/settings-status';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('app:settings-status');
	const settings = await getSettings();
	return {
		user: locals.user,
		configured: settings.llmVerified,
		hasHome: hasSavedHomeLocation(settings),
		hasSearchConfig: settings.jobSearchKeywords.length > 0 && settings.businessOsmTags.length > 0
	};
};
