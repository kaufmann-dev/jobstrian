import { DEFAULT_LISTING_FILTERS } from '#lib/list-pages.js';
import { getListingPage } from '#lib/server/list-pages.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const person = await requirePerson(params);
	return { page: await getListingPage(person.id, DEFAULT_LISTING_FILTERS) };
};
