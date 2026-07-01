import { describe, expect, it } from 'vitest';
import { leadContactFormSchema, leadContactSchema } from './lead-contact';

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

	it('normalizes scheme-less websites to https and rejects non-http schemes', () => {
		expect(leadContactSchema.parse({ website: 'www.gasthaus-huber.at' })).toEqual({
			website: 'https://www.gasthaus-huber.at/'
		});
		expect(leadContactSchema.parse({ website: 'example.com/jobs' })).toEqual({
			website: 'https://example.com/jobs'
		});
		expect(leadContactSchema.safeParse({ website: 'javascript:alert(1)' }).success).toBe(false);
		expect(leadContactSchema.safeParse({ website: 'ftp://example.com' }).success).toBe(false);
	});
});

describe('leadContactFormSchema', () => {
	it('normalizes scheme-less websites and keeps empty input valid', () => {
		expect(leadContactFormSchema.parse({ phone: '', email: '', website: 'www.gasthaus-huber.at' }))
			.toEqual({
				phone: '',
				email: '',
				website: 'https://www.gasthaus-huber.at/'
			});
		expect(leadContactFormSchema.parse({ phone: '', email: '', website: '' })).toEqual({
			phone: '',
			email: '',
			website: ''
		});
	});

	it('rejects non-http website schemes', () => {
		expect(
			leadContactFormSchema.safeParse({ phone: '', email: '', website: 'javascript:alert(1)' })
				.success
		).toBe(false);
	});
});
