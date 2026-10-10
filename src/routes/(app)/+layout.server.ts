import { listPeople, toPersonSummary } from '#lib/server/people.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		people: (await listPeople()).map(toPersonSummary)
	};
};
