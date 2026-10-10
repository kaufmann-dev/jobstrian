import { describe, expect, it } from 'vitest';
import { personColor, personInitials, personInputSchema, slugify } from './people';

describe('slugify', () => {
	it('builds URL-safe slugs and folds German umlauts', () => {
		expect(slugify('Mäx Müller')).toBe('maex-mueller');
		expect(slugify('  Maria  ')).toBe('maria');
		expect(slugify('Anna-Lena Groß')).toBe('anna-lena-gross');
		expect(slugify('José')).toBe('jose');
	});

	it('never returns an empty slug', () => {
		expect(slugify('???')).toBe('person');
	});
});

describe('person helpers', () => {
	it('derives initials', () => {
		expect(personInitials('Maria Huber')).toBe('MH');
		expect(personInitials('Mama')).toBe('MA');
		expect(personInitials('  ')).toBe('?');
	});

	it('falls back to the default colour for unknown tokens', () => {
		expect(personColor('does-not-exist')).toBe(personColor('amber'));
	});

	it('validates the name and colour of a person', () => {
		expect(personInputSchema.safeParse({ name: ' ' }).success).toBe(false);
		expect(personInputSchema.parse({ name: 'Maria' }).color).toBe('amber');
		expect(personInputSchema.safeParse({ name: 'Maria', color: 'pink' }).success).toBe(false);
	});
});
