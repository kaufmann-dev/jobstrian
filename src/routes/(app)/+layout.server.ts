import { getSettings } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings = await getSettings();
	return {
		user: locals.user,
		configured: Boolean(settings.llmBaseUrl && settings.llmModel),
		hasHome: Boolean(settings.homeAddress.trim())
	};
};
