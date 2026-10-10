import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import {
	applicationInputSchema,
	applicationPatchSchema,
	searchInputSchema,
	searchPatchSchema,
	statusChangeSchema,
	todayVienna
} from '#lib/applications.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import {
	addApplicationNote,
	createApplication,
	createSearch,
	deleteApplication,
	eventsForSearch,
	isServiceError,
	listApplications,
	listSearches,
	setApplicationStatus,
	updateApplication,
	updateSearch
} from '#lib/server/applications/service.js';
import { requirePerson } from '#lib/server/request-person.js';
import {
	applicationFormSchema,
	idFormSchema,
	noteFormSchema,
	searchFormSchema,
	searchStatusFormSchema,
	statusFormSchema
} from './schema';
import type { Actions, PageServerLoad } from './$types';

const emptyToUndefined = (value: string) => (value === '' ? undefined : value);

export const load: PageServerLoad = async ({ params, url }) => {
	const person = await requirePerson(params);
	const searches = await listSearches(person.id);
	const requested = Number.parseInt(url.searchParams.get('search') ?? '', 10);
	const selected =
		searches.find((search) => search.id === requested) ??
		searches.find((search) => search.status === 'searching') ??
		searches[0] ??
		null;

	const [applications, events, appSettings] = await Promise.all([
		selected
			? listApplications({
					personId: person.id,
					searchId: selected.id,
					bucket: 'all',
					limit: 100
				})
			: null,
		selected
			? eventsForSearch(person.id, selected.id)
			: Promise.resolve({} as Awaited<ReturnType<typeof eventsForSearch>>),
		getAppSettings()
	]);
	// A page of 100 is the service maximum; fetch the rest so the tabs are complete.
	const items = applications ? [...applications.items] : [];
	let cursor = applications?.nextCursor ?? null;
	while (selected && cursor) {
		const more = await listApplications({
			personId: person.id,
			searchId: selected.id,
			bucket: 'all',
			limit: 100,
			cursor
		});
		items.push(...more.items);
		cursor = more.nextCursor;
	}

	return {
		searches,
		selectedSearchId: selected?.id ?? null,
		applications: items,
		events,
		bucketCounts: applications?.bucketCounts ?? null,
		ghostAfterDays: appSettings.ghostAfterDays,
		today: todayVienna(),
		hasActiveSearch: searches.some((search) => search.status === 'searching'),
		searchForm: await superValidate(
			{ title: `Jobsuche ${todayVienna().slice(0, 4)}` },
			zod4(searchFormSchema),
			{ id: 'search' }
		),
		searchStatusForm: await superValidate(zod4(searchStatusFormSchema), { id: 'search-status' }),
		applicationForm: await superValidate(zod4(applicationFormSchema), { id: 'application' }),
		statusForm: await superValidate(zod4(statusFormSchema), { id: 'status' }),
		noteForm: await superValidate(zod4(noteFormSchema), { id: 'note' })
	};
};

export const actions: Actions = {
	saveSearch: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(searchFormSchema), { id: 'search' });
		if (!form.valid) return fail(400, { form });
		try {
			if (form.data.id) {
				await updateSearch(
					person.id,
					form.data.id,
					searchPatchSchema.parse({
						title: form.data.title,
						goal: form.data.goal,
						notes: form.data.notes
					})
				);
			} else {
				await createSearch(
					person.id,
					searchInputSchema.parse({
						title: form.data.title,
						goal: form.data.goal,
						notes: form.data.notes,
						startedOn: emptyToUndefined(form.data.startedOn)
					})
				);
			}
		} catch (error) {
			if (isServiceError(error)) return setError(form, 'title', error.message);
			throw error;
		}
		return message(form, form.data.id ? 'Suche gespeichert.' : 'Suche gestartet.');
	},
	setSearchStatus: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(searchStatusFormSchema), {
			id: 'search-status'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await updateSearch(
				person.id,
				form.data.id,
				searchPatchSchema.parse({
					status: form.data.status,
					endedOn: emptyToUndefined(form.data.endedOn)
				})
			);
		} catch (error) {
			if (isServiceError(error))
				return message(form, error.message, { status: error.status as 400 });
			throw error;
		}
		return message(form, 'Suche aktualisiert.');
	},
	saveApplication: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(applicationFormSchema), { id: 'application' });
		if (!form.valid) return fail(400, { form });
		const parsed = applicationInputSchema.safeParse(form.data);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				setError(form, (issue.path[0] as keyof typeof form.data) ?? 'companyName', issue.message);
			}
			return fail(400, { form });
		}
		try {
			if (form.data.id) {
				// The status changes only through setStatus; the patch schema drops it.
				await updateApplication(person.id, form.data.id, applicationPatchSchema.parse(parsed.data));
			} else {
				await createApplication(person.id, parsed.data, { searchId: form.data.searchId });
			}
		} catch (error) {
			if (isServiceError(error))
				return message(form, error.message, { status: error.status as 400 });
			throw error;
		}
		return message(form, form.data.id ? 'Bewerbung gespeichert.' : 'Bewerbung angelegt.');
	},
	setStatus: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(statusFormSchema), { id: 'status' });
		if (!form.valid) return fail(400, { form });
		try {
			await setApplicationStatus(
				person.id,
				form.data.id,
				statusChangeSchema.parse({
					status: form.data.status,
					note: form.data.note,
					occurredOn: emptyToUndefined(form.data.occurredOn),
					// Empty means "unchanged"; rejections and withdrawals clear it in the service.
					nextStepOn: emptyToUndefined(form.data.nextStepOn),
					nextStepNote: emptyToUndefined(form.data.nextStepNote)
				})
			);
		} catch (error) {
			if (isServiceError(error))
				return message(form, error.message, { status: error.status as 400 });
			throw error;
		}
		return message(form, 'Status aktualisiert.');
	},
	addNote: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(noteFormSchema), { id: 'note' });
		if (!form.valid) return fail(400, { form });
		try {
			await addApplicationNote(person.id, form.data.id, {
				note: form.data.note,
				occurredOn: emptyToUndefined(form.data.occurredOn)
			});
		} catch (error) {
			if (isServiceError(error))
				return message(form, error.message, { status: error.status as 400 });
			throw error;
		}
		return message(form, 'Notiz gespeichert.');
	},
	deleteApplication: async ({ request, params }) => {
		const person = await requirePerson(params);
		const form = await superValidate(request, zod4(idFormSchema));
		if (!form.valid) return fail(400, { form });
		try {
			await deleteApplication(person.id, form.data.id);
		} catch (error) {
			if (isServiceError(error))
				return message(form, error.message, { status: error.status as 400 });
			throw error;
		}
		return message(form, 'Bewerbung gelöscht.');
	}
};
