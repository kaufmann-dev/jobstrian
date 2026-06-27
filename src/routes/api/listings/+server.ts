import { json } from '@sveltejs/kit';
import { getListingPage, listingFiltersSchema } from '$lib/server/list-pages';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const result = listingFiltersSchema.safeParse({
		source: url.searchParams.get('source'),
		verdict: url.searchParams.get('verdict'),
		showClosed: url.searchParams.get('showClosed') === 'true',
		search: url.searchParams.get('search') ?? '',
		sort: url.searchParams.get('sort') ?? undefined,
		cursor: url.searchParams.get('cursor')
	});
	if (!result.success) return json({ message: 'Ungültige Filter' }, { status: 400 });
	const { cursor, ...filters } = result.data;
	try {
		return json(await getListingPage(filters, cursor));
	} catch (error) {
		console.error('Stellen konnten nicht aufgelistet werden', error);
		return json({ message: 'Stellen konnten nicht geladen werden.' }, { status: 500 });
	}
};
