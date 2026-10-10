import { z } from 'zod';

/** Accent colours a person can have; the class names must stay literal for Tailwind. */
export const PERSON_COLORS = {
	amber: {
		label: 'Bernstein',
		dot: 'bg-amber-500',
		soft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
	},
	rose: {
		label: 'Rosé',
		dot: 'bg-rose-500',
		soft: 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
	},
	sky: { label: 'Himmel', dot: 'bg-sky-500', soft: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
	emerald: {
		label: 'Smaragd',
		dot: 'bg-emerald-500',
		soft: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
	},
	violet: {
		label: 'Violett',
		dot: 'bg-violet-500',
		soft: 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
	},
	orange: {
		label: 'Orange',
		dot: 'bg-orange-500',
		soft: 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
	}
} as const;

export type PersonColor = keyof typeof PERSON_COLORS;
export const PERSON_COLOR_KEYS = Object.keys(PERSON_COLORS) as PersonColor[];

export function personColor(color: string) {
	return PERSON_COLORS[color as PersonColor] ?? PERSON_COLORS.amber;
}

export const personNameSchema = z.string().trim().min(1, 'Name fehlt.').max(80);
export const personColorSchema = z.enum(PERSON_COLOR_KEYS as [PersonColor, ...PersonColor[]]);

export const personInputSchema = z.object({
	name: personNameSchema,
	color: personColorSchema.default('amber')
});

/** Lowercase URL segment from a display name ("Mäx Müller" -> "maex-mueller"). */
export function slugify(name: string): string {
	const slug = name
		.normalize('NFKC')
		.toLocaleLowerCase('de-AT')
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'person';
}

/** The first letter(s) shown in the avatar. */
export function personInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('de-AT');
	return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('de-AT');
}

/** The public part of a person (no credentials) that pages may receive. */
export interface PersonSummary {
	id: number;
	slug: string;
	name: string;
	color: string;
}
