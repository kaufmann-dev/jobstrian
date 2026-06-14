import { z } from 'zod';

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
	.refine((value) => value == null || z.url().safeParse(value).success, {
		message: 'Gib eine gültige Website-URL ein.'
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
		.refine((value) => value === '' || z.url().safeParse(value).success, {
			message: 'Gib eine gültige Website-URL ein.'
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
