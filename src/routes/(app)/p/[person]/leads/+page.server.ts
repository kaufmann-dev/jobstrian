import { DEFAULT_LEAD_FILTERS } from '#lib/list-pages.js';
import { getLeadPage } from '#lib/server/list-pages.js';
import { getCvMeta } from '#lib/server/cv.js';
import { getApplicationEmailSummary } from '#lib/server/application-email/runner.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const person = await requirePerson(params);
	return {
		page: await getLeadPage(person.id, DEFAULT_LEAD_FILTERS),
		hasCv: (await getCvMeta(person.id)) !== null,
		applicationEmail: await getApplicationEmailSummary(person.id)
	};
};
