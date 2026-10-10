import { error } from '@sveltejs/kit';
import { findPersonBySlug } from './people';
import type { Person } from './db/schema';

/** Resolve the `[person]` route param to a person, or answer 404 JSON/HTML via SvelteKit. */
export async function requirePerson(params: { person: string }): Promise<Person> {
	const found = await findPersonBySlug(params.person);
	if (!found) error(404, 'Person nicht gefunden');
	return found;
}
