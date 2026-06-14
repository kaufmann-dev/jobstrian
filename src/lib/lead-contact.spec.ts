import { describe, expect, it } from 'vitest';
import { leadContactSchema } from './lead-contact';

describe('leadContactSchema', () => {
	it('normalizes contact values and supports manual deletions', () => {
		expect(
			leadContactSchema.parse({
				phone: ' +43 1 234 ',
				email: ' JOBS@EXAMPLE.COM ',
				website: ' https://example.com/jobs '
			})
		).toEqual({
			phone: '+43 1 234',
			email: 'jobs@example.com',
			website: 'https://example.com/jobs'
		});
		expect(leadContactSchema.parse({ phone: '', email: null, website: '' })).toEqual({
			phone: null,
			email: null,
			website: null
		});
	});

	it('rejects empty updates and invalid contact values', () => {
		expect(leadContactSchema.safeParse({}).success).toBe(false);
		expect(leadContactSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
		expect(leadContactSchema.safeParse({ website: 'not-a-url' }).success).toBe(false);
	});
});
