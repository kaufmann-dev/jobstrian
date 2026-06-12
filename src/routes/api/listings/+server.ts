import { json } from '@sveltejs/kit';
import { getListingPage, listingFiltersSchema } from '$lib/server/list-pages';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const result = listingFiltersSchema.safeParse({
		source: url.searchParams.get('source'),
		verdict: url.searchParams.get('verdict'),
		showClosed: url.searchParams.get('showClosed') === 'true',
		cursor: url.searchParams.get('cursor')
	});
	if (!result.success) return json({ message: 'Ungültige Filter' }, { status: 400 });
	const { cursor, ...filters } = result.data;
	return json(await getListingPage(filters, cursor));
};
