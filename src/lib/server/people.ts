import { asc, eq } from 'drizzle-orm';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '#lib/ranking-criteria.js';
import { DEFAULT_BUSINESS_OSM_TAGS, DEFAULT_JOB_SEARCH_KEYWORDS } from '#lib/search-config.js';
import { PERSON_COLOR_KEYS, slugify, type PersonColor, type PersonSummary } from '#lib/people.js';
import { db } from './db';
import { person, type Person } from './db/schema';

export const ALL_SOURCES = ['hokify', 'willhaben', 'karriere', 'ams'] as const;

export const DEFAULT_SOURCES = ['hokify', 'willhaben', 'karriere', 'ams'];

export class PersonNotFoundError extends Error {
	constructor(readonly ref: string | number) {
		super(`Person "${ref}" nicht gefunden.`);
		this.name = 'PersonNotFoundError';
	}
}

export async function listPeople(): Promise<Person[]> {
	return db.select().from(person).orderBy(asc(person.id));
}

export async function findPerson(id: number): Promise<Person | null> {
	const rows = await db.select().from(person).where(eq(person.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function getPerson(id: number): Promise<Person> {
	const found = await findPerson(id);
	if (!found) throw new PersonNotFoundError(id);
	return found;
}

export async function findPersonBySlug(slug: string): Promise<Person | null> {
	const rows = await db.select().from(person).where(eq(person.slug, slug)).limit(1);
	return rows[0] ?? null;
}

export async function getPersonBySlug(slug: string): Promise<Person> {
	const found = await findPersonBySlug(slug);
	if (!found) throw new PersonNotFoundError(slug);
	return found;
}

/** Resolve a person by slug, falling back to a case-insensitive exact name match. */
export async function resolvePersonRef(ref: string): Promise<Person> {
	const wanted = ref.trim().toLocaleLowerCase('de-AT');
	const everyone = await listPeople();
	const match =
		everyone.find((p) => p.slug === wanted) ??
		everyone.find((p) => p.name.toLocaleLowerCase('de-AT') === wanted);
	if (!match) throw new PersonNotFoundError(ref);
	return match;
}

export async function updatePerson(id: number, patch: Partial<Person>): Promise<Person> {
	const updated = await db.update(person).set(patch).where(eq(person.id, id)).returning();
	if (updated.length === 0) throw new PersonNotFoundError(id);
	return updated[0];
}

function nextColor(used: string[]): PersonColor {
	return PERSON_COLOR_KEYS.find((color) => !used.includes(color)) ?? PERSON_COLOR_KEYS[0];
}

/** Pick a free slug ("maria", "maria-2", …). */
function uniqueSlug(name: string, taken: Set<string>): string {
	const base = slugify(name);
	if (!taken.has(base)) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base}-${i}`;
		if (!taken.has(candidate)) return candidate;
	}
}

export class DuplicatePersonNameError extends Error {
	constructor() {
		super('Es gibt bereits eine Person mit diesem Namen.');
		this.name = 'DuplicatePersonNameError';
	}
}

/** Create a person with the standard defaults for search, sources and ranking. */
export async function createPerson(input: { name: string; color?: PersonColor }): Promise<Person> {
	const name = input.name.trim();
	const everyone = await listPeople();
	if (everyone.some((p) => p.name.toLocaleLowerCase('de-AT') === name.toLocaleLowerCase('de-AT'))) {
		throw new DuplicatePersonNameError();
	}
	const inserted = await db
		.insert(person)
		.values({
			name,
			slug: uniqueSlug(name, new Set(everyone.map((p) => p.slug))),
			color: input.color ?? nextColor(everyone.map((p) => p.color)),
			fullName: name,
			jobSearchKeywords: DEFAULT_JOB_SEARCH_KEYWORDS,
			businessOsmTags: DEFAULT_BUSINESS_OSM_TAGS,
			listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
			leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
			enabledSources: [...DEFAULT_SOURCES],
			businessRadiusMeters: 5000
		})
		.returning();
	return inserted[0];
}

export async function renamePerson(
	id: number,
	input: { name: string; color: PersonColor }
): Promise<Person> {
	const name = input.name.trim();
	const clash = (await listPeople()).find(
		(p) => p.id !== id && p.name.toLocaleLowerCase('de-AT') === name.toLocaleLowerCase('de-AT')
	);
	if (clash) throw new DuplicatePersonNameError();
	return updatePerson(id, { name, color: input.color });
}

/** Delete a person and, via cascade, everything that belongs to them. */
export async function deletePerson(id: number): Promise<void> {
	await db.delete(person).where(eq(person.id, id));
}

export function toPersonSummary(
	row: Pick<Person, 'id' | 'slug' | 'name' | 'color'>
): PersonSummary {
	return { id: row.id, slug: row.slug, name: row.name, color: row.color };
}
