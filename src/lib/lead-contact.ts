import { z } from 'zod';
import { normalizeWebsiteUrl } from './website';

const optionalContact = z
	.string()
	.trim()
	.max(500)
	.nullable()
	.optional()
	.transform((value) => (value === '' ? null : value));

const optionalEmail = optionalContact
	.refine((value) => value == null || z.email().safeParse(value).success, {
		message: 'Gib eine gültige E-Mail-Adresse ein.'
	})
	.transform((value) => (value == null ? value : value.toLowerCase()));

const optionalWebsite = z
	.string()
	.trim()
	.max(1000)
	.nullable()
	.optional()
	.transform((value) => (value === '' ? null : value))
	.transform((value, ctx) => {
		if (value == null) return value;
		const normalized = normalizeWebsiteUrl(value);
		if (!normalized) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Gib eine gültige Website-URL ein.'
			});
			return z.NEVER;
		}
		return normalized.href;
	});

export const leadContactFormSchema = z.object({
	phone: z.string().trim().max(500),
	email: z
		.string()
		.trim()
		.max(500)
		.refine((value) => value === '' || z.email().safeParse(value).success, {
			message: 'Gib eine gültige E-Mail-Adresse ein.'
		}),
	website: z
		.string()
		.trim()
		.max(1000)
		.transform((value, ctx) => {
			if (value === '') return '';
			const normalized = normalizeWebsiteUrl(value);
			if (!normalized) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Gib eine gültige Website-URL ein.'
				});
				return z.NEVER;
			}
			return normalized.href;
		})
});

export const leadContactSchema = z
	.object({
		phone: optionalContact,
		email: optionalEmail,
		website: optionalWebsite
	})
	.refine(
		(value) =>
			value.phone !== undefined || value.email !== undefined || value.website !== undefined,
		{
			message: 'Mindestens ein Kontaktfeld muss angegeben werden.'
		}
	);

export type LeadContact = z.infer<typeof leadContactSchema>;
