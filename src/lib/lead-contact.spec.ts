import { describe, expect, it } from 'vitest';
import { leadContactSchema } from './lead-contact';

describe('leadContactSchema', () => {
	it('normalizes contact values and supports manual deletions', () => {
		expect(leadContactSchema.parse({ phone: ' +43 1 234 ', email: ' JOBS@EXAMPLE.COM ' })).toEqual({
			phone: '+43 1 234',
			email: 'jobs@example.com'
		});
		expect(leadContactSchema.parse({ phone: '', email: null })).toEqual({
			phone: null,
			email: null
		});
	});

	it('rejects empty updates and invalid email addresses', () => {
		expect(leadContactSchema.safeParse({}).success).toBe(false);
		expect(leadContactSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
	});
});
