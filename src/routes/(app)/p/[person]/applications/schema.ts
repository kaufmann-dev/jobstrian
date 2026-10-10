import { z } from 'zod';
import { APPLICATION_CHANNELS, APPLICATION_STATUSES, SEARCH_STATUSES } from '#lib/applications.js';

const id = z.number().int().positive();
// Form fields are plain strings; empty means "not set". The actions map them onto the
// shared service schemas in #lib/applications.
const formDate = z.union([z.iso.date(), z.literal('')]);
const text = (max: number) => z.string().trim().max(max);

export const searchFormSchema = z.object({
	id: id.optional(),
	title: text(120).min(1, 'Titel fehlt.'),
	goal: text(500).default(''),
	notes: text(5000).default(''),
	startedOn: formDate.default('')
});

/** Close, pause or reopen a search. */
export const searchStatusFormSchema = z.object({
	id,
	status: z.enum(SEARCH_STATUSES),
	endedOn: formDate.default('')
});

export const applicationFormSchema = z.object({
	id: id.optional(),
	searchId: id.optional(),
	companyName: text(200).min(1, 'Firma fehlt.'),
	positionTitle: text(200).default(''),
	url: text(1000).default(''),
	location: text(200).default(''),
	contactName: text(200).default(''),
	contactEmail: text(200).default(''),
	contactPhone: text(50).default(''),
	channel: z.enum(APPLICATION_CHANNELS).default('email'),
	status: z.enum(APPLICATION_STATUSES).default('applied'),
	appliedOn: formDate.default(''),
	nextStepOn: formDate.default(''),
	nextStepNote: text(500).default(''),
	notes: text(5000).default('')
});

export const statusFormSchema = z.object({
	id,
	status: z.enum(APPLICATION_STATUSES),
	note: text(2000).default(''),
	occurredOn: formDate.default(''),
	nextStepOn: formDate.default(''),
	nextStepNote: text(500).default('')
});

export const noteFormSchema = z.object({
	id,
	note: text(2000).min(1, 'Notiz fehlt.'),
	occurredOn: formDate.default('')
});

export const idFormSchema = z.object({ id });
