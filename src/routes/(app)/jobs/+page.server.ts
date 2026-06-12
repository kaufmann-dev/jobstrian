import { DEFAULT_LISTING_FILTERS } from '$lib/list-pages';
import { getListingPage } from '$lib/server/list-pages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { page: await getListingPage(DEFAULT_LISTING_FILTERS) };
};
