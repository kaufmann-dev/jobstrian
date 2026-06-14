import { json } from '@sveltejs/kit';
import { osmBusinessTagSuggestions } from '$lib/search-config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ suggestions: [] });

	return json({ suggestions: osmBusinessTagSuggestions(q) });
};
