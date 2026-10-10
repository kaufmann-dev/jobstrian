import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import {
	addModelsFormSchema,
	appSettingsFormSchema,
	clientIdFormSchema,
	connectionFormSchema,
	idFormSchema,
	loadModelsFormSchema,
	personFormSchema
} from '#lib/app-settings-schema.js';
import { authBaseURL } from '#lib/server/auth.js';
import { getAppSettings, updateAppSettings } from '#lib/server/app-settings.js';
import { db } from '#lib/server/db/index.js';
import { application, lead, listing } from '#lib/server/db/schema.js';
import { listConnectedApps, revokeConnectedApp } from '#lib/server/mcp/connected-apps.js';
import {
	addModels,
	createConnection,
	deleteConnection,
	existingModelIds,
	fetchAvailableModels,
	listConnections,
	removeModel,
	updateConnection,
	verifyLlmModel
} from '#lib/server/llm/connections.js';
import {
	createPerson,
	deletePerson,
	DuplicatePersonNameError,
	listPeople,
	renamePerson
} from '#lib/server/people.js';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function countsByPerson(table: typeof listing | typeof lead | typeof application) {
	const rows = await db
		.select({ personId: table.personId, n: sql<number>`count(*)::int` })
		.from(table)
		.groupBy(table.personId);
	return new Map(rows.map((row) => [row.personId, row.n]));
}

export const load: PageServerLoad = async ({ locals }) => {
	const [people, connections, appSettings, listings, leads, applications, connectedApps] =
		await Promise.all([
			listPeople(),
			listConnections(),
			getAppSettings(),
			countsByPerson(listing),
			countsByPerson(lead),
			countsByPerson(application),
			locals.user ? listConnectedApps(locals.user.id) : []
		]);
	return {
		people: people.map((p) => ({
			id: p.id,
			slug: p.slug,
			name: p.name,
			color: p.color,
			listings: listings.get(p.id) ?? 0,
			leads: leads.get(p.id) ?? 0,
			applications: applications.get(p.id) ?? 0
		})),
		connections,
		connectedApps,
		mcpUrl: `${authBaseURL}/mcp`,
		appSettingsForm: await superValidate(
			{
				defaultLlmModelId: appSettings.defaultLlmModelId,
				ghostAfterDays: appSettings.ghostAfterDays
			},
			zod4(appSettingsFormSchema),
			{ id: 'app-settings' }
		),
		personForm: await superValidate(zod4(personFormSchema), { id: 'person' }),
		connectionForm: await superValidate(zod4(connectionFormSchema), { id: 'connection' }),
		addModelsForm: await superValidate(zod4(addModelsFormSchema), { id: 'add-models' })
	};
};

export const actions: Actions = {
	savePerson: async ({ request }) => {
		const form = await superValidate(request, zod4(personFormSchema), { id: 'person' });
		if (!form.valid) return fail(400, { form });
		try {
			if (form.data.id) {
				await renamePerson(form.data.id, { name: form.data.name, color: form.data.color });
			} else {
				await createPerson({ name: form.data.name, color: form.data.color });
			}
		} catch (error) {
			if (error instanceof DuplicatePersonNameError) {
				return setError(form, 'name', error.message);
			}
			throw error;
		}
		return message(form, form.data.id ? 'Person gespeichert.' : 'Person angelegt.');
	},
	deletePerson: async ({ request }) => {
		const form = await superValidate(request, zod4(idFormSchema));
		if (!form.valid) return fail(400, { form });
		await deletePerson(form.data.id);
		return message(form, 'Person gelöscht.');
	},
	saveConnection: async ({ request }) => {
		const form = await superValidate(request, zod4(connectionFormSchema), { id: 'connection' });
		if (!form.valid) return fail(400, { form });
		try {
			if (form.data.id) await updateConnection(form.data.id, form.data);
			else await createConnection(form.data);
		} catch (error) {
			if (
				error instanceof Error &&
				/llm_connection_name_unique|duplicate key/.test(error.message)
			) {
				return setError(form, 'name', 'Es gibt bereits eine Verbindung mit diesem Namen.');
			}
			throw error;
		}
		// Never echo the key back.
		form.data.apiKey = '';
		return message(form, form.data.id ? 'Verbindung gespeichert.' : 'Verbindung angelegt.');
	},
	deleteConnection: async ({ request }) => {
		const form = await superValidate(request, zod4(idFormSchema));
		if (!form.valid) return fail(400, { form });
		await deleteConnection(form.data.id);
		return message(form, 'Verbindung gelöscht.');
	},
	/** Ask the endpoint for its models; returns `{ models }` without saving anything. */
	loadModels: async ({ request }) => {
		const form = await superValidate(request, zod4(loadModelsFormSchema));
		if (!form.valid) return fail(400, { form });
		try {
			return { form, models: await fetchAvailableModels(form.data.connectionId) };
		} catch (error) {
			return fail(502, {
				form,
				models: [] as string[],
				error:
					error instanceof Error ? error.message : 'Die Modellliste konnte nicht geladen werden.'
			});
		}
	},
	addModels: async ({ request }) => {
		const form = await superValidate(request, zod4(addModelsFormSchema), { id: 'add-models' });
		if (!form.valid) return fail(400, { form });
		await addModels(form.data.connectionId, form.data.modelIds);
		return message(form, 'Modelle gespeichert.');
	},
	removeModel: async ({ request }) => {
		const form = await superValidate(request, zod4(idFormSchema));
		if (!form.valid) return fail(400, { form });
		await removeModel(form.data.id);
		return message(form, 'Modell entfernt.');
	},
	verifyModel: async ({ request }) => {
		const form = await superValidate(request, zod4(idFormSchema));
		if (!form.valid) return fail(400, { form });
		try {
			await verifyLlmModel(form.data.id);
		} catch (error) {
			console.error('Modellprüfung fehlgeschlagen', error);
			return message(
				form,
				'Die Prüfung ist fehlgeschlagen. Prüfe Base URL, API-Key und Modellname.',
				{ status: 502 }
			);
		}
		return message(form, 'Modell erfolgreich geprüft.');
	},
	revokeApp: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Nicht angemeldet.' });
		const form = await superValidate(request, zod4(clientIdFormSchema));
		if (!form.valid) return fail(400, { form });
		await revokeConnectedApp(locals.user.id, form.data.clientId);
		return message(form, 'Verbindung widerrufen.');
	},
	saveAppSettings: async ({ request }) => {
		const form = await superValidate(request, zod4(appSettingsFormSchema), {
			id: 'app-settings'
		});
		if (!form.valid) return fail(400, { form });
		if (form.data.defaultLlmModelId != null) {
			const known = await existingModelIds([form.data.defaultLlmModelId]);
			if (!known.has(form.data.defaultLlmModelId)) {
				return setError(form, 'defaultLlmModelId', 'Dieses Modell existiert nicht mehr.');
			}
		}
		await updateAppSettings({
			defaultLlmModelId: form.data.defaultLlmModelId,
			ghostAfterDays: form.data.ghostAfterDays
		});
		return message(form, 'Gespeichert.');
	}
};
