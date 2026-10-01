import { DEFAULT_LEAD_FILTERS } from '#lib/list-pages.js';
import { getLeadPage } from '#lib/server/list-pages.js';
import { getCvMeta } from '#lib/server/cv.js';
import { getApplicationEmailSummary } from '#lib/server/application-email/runner.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		page: await getLeadPage(DEFAULT_LEAD_FILTERS),
		hasCv: (await getCvMeta()) !== null,
		applicationEmail: await getApplicationEmailSummary()
	};
};
