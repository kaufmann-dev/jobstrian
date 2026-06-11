import { z } from 'zod';

export const setupSchema = z
	.object({
		email: z.email('Gib eine gültige E-Mail-Adresse ein.'),
		password: z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein.'),
		confirmPassword: z.string().min(1, 'Bitte bestätige dein Passwort.')
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Die Passwörter stimmen nicht überein.',
		path: ['confirmPassword']
	});

export type SetupSchema = typeof setupSchema;
