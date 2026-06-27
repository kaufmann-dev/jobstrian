import { json } from '@sveltejs/kit';
import { getLeadPage, leadFiltersSchema } from '$lib/server/list-pages';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const result = leadFiltersSchema.safeParse({
		onlyWithEmail: url.searchParams.get('onlyWithEmail') === 'true',
		onlyOpen: url.searchParams.get('onlyOpen') !== 'false',
		hideIgnored: url.searchParams.get('hideIgnored') !== 'false',
		search: url.searchParams.get('search') ?? '',
		sort: url.searchParams.get('sort') ?? undefined,
		cursor: url.searchParams.get('cursor')
	});
	if (!result.success) return json({ message: 'Ungültige Filter' }, { status: 400 });
	const { cursor, ...filters } = result.data;
	try {
		return json(await getLeadPage(filters, cursor));
	} catch (error) {
		console.error('Betriebe konnten nicht aufgelistet werden', error);
		return json({ message: 'Betriebe konnten nicht geladen werden.' }, { status: 500 });
	}
};
