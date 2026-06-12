import { DEFAULT_LEAD_FILTERS } from '$lib/list-pages';
import { getLeadPage } from '$lib/server/list-pages';
import { getCvMeta } from '$lib/server/cv';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { page: await getLeadPage(DEFAULT_LEAD_FILTERS), hasCv: (await getCvMeta()) !== null };
};
