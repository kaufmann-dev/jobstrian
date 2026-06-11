import { fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { auth } from '$lib/server/auth';
import { hasAnyUser } from '$lib/server/users';
import { setupSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (await hasAnyUser()) {
		redirect(302, '/login');
	}

	return {
		form: await superValidate(zod4(setupSchema))
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		if (await hasAnyUser()) {
			redirect(302, '/login');
		}

		const form = await superValidate(request, zod4(setupSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.signUpEmail({
				body: {
					email: form.data.email,
					password: form.data.password,
					name: 'Admin'
				}
			});
		} catch {
			if (await hasAnyUser()) {
				return message(form, 'Die Einrichtung wurde bereits abgeschlossen.', { status: 409 });
			}

			return setError(
				form,
				'email',
				'Der Benutzer konnte nicht erstellt werden. Bitte prüfe die Eingaben.'
			);
		}

		redirect(303, '/login');
	}
};
