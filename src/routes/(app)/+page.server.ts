import { overview } from '#lib/server/applications/service.js';
import type { PageServerLoad } from './$types';

/** One tracker summary per person; `overview` only carries the public person fields. */
export const load: PageServerLoad = async () => {
	return { overviews: await overview() };
};
