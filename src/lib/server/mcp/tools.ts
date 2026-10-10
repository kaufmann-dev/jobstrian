import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
	APPLICATION_BUCKETS,
	APPLICATION_CHANNELS,
	APPLICATION_STATUSES,
	SEARCH_STATUSES,
	applicationInputSchema,
	applicationPatchSchema,
	responseRate,
	searchInputSchema,
	statusChangeSchema
} from '#lib/applications.js';
import {
	ServiceError,
	addApplicationNote,
	createApplication,
	createSearch,
	deleteApplication,
	getApplication,
	listApplications,
	listSearches,
	overview,
	setApplicationStatus,
	updateApplication,
	updateSearch,
	type ApplicationView,
	type SearchView
} from '../applications/service';
import { PersonNotFoundError, listPeople, resolvePersonRef } from '../people';
import type { ApplicationEvent } from '../db/schema';
import { TOOL_SCOPES, type McpToolName } from './scopes';

export const INSTRUCTIONS = `Jobstrian tracks job applications for several people (the owner applies for themself, family and friends). Every tool that touches applications takes the person's slug in "person"; call list_people first to see the slugs.

A person's applications are grouped into search episodes ("Jobsuche 2026"). Only one episode per person is running; getting a job ends it and a later search starts a new one.

Many employers never answer, so "applied" is NOT progress. Applications live in buckets:
- responded: the company really reacted (replied, interview, offer, accepted). This is what matters.
- waiting: applied, no reply yet, within the ghost threshold.
- ghosted: applied, no reply for longer than the threshold. Derived from the date; never set it.
- closed: rejected or withdrawn.
- planned: not sent yet.
list_applications returns the responded bucket by default and always reports bucket_counts so you know what is hidden. Do not report "applied" counts as good news.

Typical workflow: when the owner asks about replies, read the mail with the mail connector, match the sender to an application (list_applications with bucket "all" and q), then call set_application_status (status "replied", "interview", "rejected" …, with a short note and, for interviews, next_step_on). Use add_application_note for anything that is not a status change. Dates are YYYY-MM-DD in Vienna time.`;

function json(value: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

async function guard(fn: () => Promise<unknown>): Promise<CallToolResult> {
	try {
		return json(await fn());
	} catch (error) {
		if (error instanceof ServiceError || error instanceof PersonNotFoundError) {
			return { isError: true, content: [{ type: 'text', text: error.message }] };
		}
		console.error('[mcp] tool failed', error);
		return { isError: true, content: [{ type: 'text', text: 'Internal error. Try again later.' }] };
	}
}

/** Resolve the person argument; unknown references list the valid slugs. */
async function personFor(ref: string) {
	try {
		return await resolvePersonRef(ref);
	} catch (error) {
		if (error instanceof PersonNotFoundError) {
			const slugs = (await listPeople()).map((p) => p.slug).join(', ');
			throw new ServiceError(`Person "${ref}" not found. Available people: ${slugs || 'none'}.`);
		}
		throw error;
	}
}

const personArg = z
	.string()
	.trim()
	.min(1)
	.describe('Slug (or exact name) of the person; see list_people.');
const date = z.iso.date();
const optionalDate = date.nullable().optional();

function applicationOut(app: ApplicationView) {
	return {
		id: app.id,
		search_id: app.searchId,
		company: app.companyName,
		position: app.positionTitle,
		url: app.url,
		location: app.location,
		contact: { name: app.contactName, email: app.contactEmail, phone: app.contactPhone },
		channel: app.channel,
		status: app.status,
		bucket: app.bucket,
		applied_on: app.appliedOn,
		days_since_applied: app.daysSinceApplied,
		responded_at: app.respondedAt?.toISOString() ?? null,
		next_step_on: app.nextStepOn,
		next_step_note: app.nextStepNote,
		notes: app.notes,
		source: app.source,
		last_event: app.lastEvent
			? {
					kind: app.lastEvent.kind,
					status: app.lastEvent.status,
					note: app.lastEvent.note,
					occurred_at: app.lastEvent.occurredAt.toISOString()
				}
			: null
	};
}

function eventOut(event: ApplicationEvent) {
	return {
		kind: event.kind,
		status: event.status,
		note: event.note,
		occurred_at: event.occurredAt.toISOString()
	};
}

function searchOut(search: SearchView | Awaited<ReturnType<typeof createSearch>>) {
	const counts = 'bucketCounts' in search ? search.bucketCounts : undefined;
	return {
		id: search.id,
		title: search.title,
		goal: search.goal,
		notes: search.notes,
		status: search.status,
		started_on: search.startedOn,
		ended_on: search.endedOn,
		...(counts
			? {
					bucket_counts: counts,
					sent: (search as SearchView).sent,
					reacted: (search as SearchView).reacted,
					response_rate: responseRate({
						sent: (search as SearchView).sent,
						reacted: (search as SearchView).reacted
					}),
					accepted_company: (search as SearchView).acceptedCompany
				}
			: {})
	};
}

/** Builds a server exposing only the tools that `scopes` permit. */
export function createMcpServer(scopes: ReadonlySet<string>): McpServer {
	const server = new McpServer(
		{ name: 'jobstrian', version: '1.0.0' },
		{ instructions: INSTRUCTIONS }
	);
	const allowed = (tool: McpToolName) => scopes.has(TOOL_SCOPES[tool]);

	if (allowed('list_people'))
		server.registerTool(
			'list_people',
			{
				title: 'List people',
				description:
					'Lists the people the owner applies for, with the slug used by all other tools and the title of their running search.',
				annotations: { readOnlyHint: true }
			},
			() =>
				guard(async () =>
					(await overview()).map((o) => ({
						slug: o.person.slug,
						name: o.person.name,
						running_search: o.activeSearch?.title ?? null,
						responded: o.bucketCounts.responded
					}))
				)
		);

	if (allowed('get_overview'))
		server.registerTool(
			'get_overview',
			{
				title: 'Get overview',
				description:
					'Summarises the running search of one person (or of everybody when person is omitted): bucket counts, applications that need attention (upcoming or overdue next steps) and applications that just turned ghosted.',
				inputSchema: z.object({ person: personArg.optional() }),
				annotations: { readOnlyHint: true }
			},
			({ person }) =>
				guard(async () => {
					const owner = person ? await personFor(person) : null;
					return (await overview(owner?.id)).map((o) => ({
						person: o.person.slug,
						running_search: o.activeSearch,
						bucket_counts: o.bucketCounts,
						sent: o.sent,
						reacted: o.reacted,
						response_rate: responseRate({ sent: o.sent, reacted: o.reacted }),
						upcoming_next_steps: o.upcoming.map((u) => ({
							application_id: u.applicationId,
							company: u.companyName,
							position: u.positionTitle,
							status: u.status,
							next_step_on: u.nextStepOn,
							next_step_note: u.nextStepNote,
							overdue: u.overdue
						})),
						newly_ghosted: o.newlyGhosted.map((g) => ({
							application_id: g.applicationId,
							company: g.companyName,
							applied_on: g.appliedOn
						}))
					}));
				})
		);

	if (allowed('list_searches'))
		server.registerTool(
			'list_searches',
			{
				title: 'List searches',
				description:
					'Lists the search episodes of a person, newest first, with outcome and bucket counts.',
				inputSchema: z.object({ person: personArg }),
				annotations: { readOnlyHint: true }
			},
			({ person }) =>
				guard(async () => {
					const owner = await personFor(person);
					return (await listSearches(owner.id)).map(searchOut);
				})
		);

	if (allowed('create_search'))
		server.registerTool(
			'create_search',
			{
				title: 'Start a search',
				description:
					'Starts a new search episode for a person. Fails while another search of this person is still running; close it with update_search first.',
				inputSchema: z.object({
					person: personArg,
					title: searchInputSchema.shape.title.describe('For example "Jobsuche 2026".'),
					goal: z.string().max(500).optional().describe('What the person is looking for.'),
					started_on: date.optional()
				})
			},
			({ person, title, goal, started_on }) =>
				guard(async () => {
					const owner = await personFor(person);
					const created = await createSearch(
						owner.id,
						searchInputSchema.parse({ title, goal, startedOn: started_on })
					);
					return searchOut(created);
				})
		);

	if (allowed('update_search'))
		server.registerTool(
			'update_search',
			{
				title: 'Update a search',
				description:
					'Edits a search episode: title, goal, notes, or its status (found, paused, stopped close it; searching reopens it if no other search is running).',
				inputSchema: z.object({
					person: personArg,
					search_id: z.number().int().positive(),
					title: z.string().trim().min(1).max(120).optional(),
					goal: z.string().max(500).optional(),
					notes: z.string().max(5000).optional(),
					status: z.enum(SEARCH_STATUSES).optional(),
					ended_on: optionalDate
				}),
				annotations: { destructiveHint: false }
			},
			({ person, search_id, title, goal, notes, status, ended_on }) =>
				guard(async () => {
					const owner = await personFor(person);
					const updated = await updateSearch(owner.id, search_id, {
						title,
						goal,
						notes,
						status,
						endedOn: ended_on
					});
					return searchOut(updated);
				})
		);

	if (allowed('list_applications'))
		server.registerTool(
			'list_applications',
			{
				title: 'List applications',
				description:
					'Lists applications of a person. By default only the "responded" bucket (real replies) is returned; pass bucket "all" or another bucket to see the rest. bucket_counts always covers the whole selection. Without search_id, all searches of the person are included.',
				inputSchema: z.object({
					person: personArg,
					search_id: z.number().int().positive().optional(),
					bucket: z.enum([...APPLICATION_BUCKETS, 'all']).default('responded'),
					status: z.enum(APPLICATION_STATUSES).optional(),
					q: z
						.string()
						.trim()
						.max(200)
						.optional()
						.describe('Case-insensitive text in company, position, location, contact or notes.'),
					limit: z.number().int().min(1).max(100).default(50),
					cursor: z.string().max(100).optional().describe('next_cursor of the previous page.')
				}),
				annotations: { readOnlyHint: true }
			},
			({ person, search_id, bucket, status, q, limit, cursor }) =>
				guard(async () => {
					const owner = await personFor(person);
					const page = await listApplications({
						personId: owner.id,
						searchId: search_id,
						bucket,
						status,
						q,
						limit,
						cursor
					});
					return {
						applications: page.items.map(applicationOut),
						bucket_counts: page.bucketCounts,
						next_cursor: page.nextCursor
					};
				})
		);

	if (allowed('get_application'))
		server.registerTool(
			'get_application',
			{
				title: 'Get application',
				description: 'Returns one application with its full timeline (status changes and notes).',
				inputSchema: z.object({
					person: personArg,
					application_id: z.number().int().positive()
				}),
				annotations: { readOnlyHint: true }
			},
			({ person, application_id }) =>
				guard(async () => {
					const owner = await personFor(person);
					const found = await getApplication(owner.id, application_id);
					return { ...applicationOut(found.application), timeline: found.events.map(eventOut) };
				})
		);

	if (allowed('create_application'))
		server.registerTool(
			'create_application',
			{
				title: 'Create application',
				description:
					'Records an application. It goes into the person\'s running search (a new "Jobsuche <year>" is started automatically if none is running) unless search_id is given. status defaults to "applied" with applied_on today; use "planned" for applications not sent yet.',
				inputSchema: z.object({
					person: personArg,
					company: z.string().trim().min(1).max(200),
					position: z.string().max(200).optional(),
					url: z.string().max(1000).optional().describe('Link to the job ad (http/https).'),
					location: z.string().max(200).optional(),
					contact_name: z.string().max(200).optional(),
					contact_email: z.string().max(200).optional(),
					contact_phone: z.string().max(50).optional(),
					channel: z.enum(APPLICATION_CHANNELS).optional(),
					status: z.enum(APPLICATION_STATUSES).optional(),
					applied_on: optionalDate,
					next_step_on: optionalDate,
					next_step_note: z.string().max(500).optional(),
					notes: z.string().max(5000).optional(),
					search_id: z.number().int().positive().optional()
				})
			},
			(args) =>
				guard(async () => {
					const owner = await personFor(args.person);
					const input = applicationInputSchema.parse({
						companyName: args.company,
						positionTitle: args.position,
						url: args.url,
						location: args.location,
						contactName: args.contact_name,
						contactEmail: args.contact_email,
						contactPhone: args.contact_phone,
						channel: args.channel,
						status: args.status,
						appliedOn: args.applied_on ?? undefined,
						nextStepOn: args.next_step_on ?? undefined,
						nextStepNote: args.next_step_note,
						notes: args.notes
					});
					return applicationOut(
						await createApplication(owner.id, input, { searchId: args.search_id, source: 'mcp' })
					);
				})
		);

	if (allowed('update_application'))
		server.registerTool(
			'update_application',
			{
				title: 'Update application',
				description:
					'Edits the details of an application (not its status; use set_application_status for that). Only the given fields change.',
				inputSchema: z.object({
					person: personArg,
					application_id: z.number().int().positive(),
					company: z.string().trim().min(1).max(200).optional(),
					position: z.string().max(200).optional(),
					url: z.string().max(1000).optional(),
					location: z.string().max(200).optional(),
					contact_name: z.string().max(200).optional(),
					contact_email: z.string().max(200).optional(),
					contact_phone: z.string().max(50).optional(),
					channel: z.enum(APPLICATION_CHANNELS).optional(),
					applied_on: optionalDate,
					next_step_on: optionalDate,
					next_step_note: z.string().max(500).optional(),
					notes: z.string().max(5000).optional()
				}),
				annotations: { destructiveHint: false }
			},
			(args) =>
				guard(async () => {
					const owner = await personFor(args.person);
					const patch = applicationPatchSchema.parse({
						companyName: args.company,
						positionTitle: args.position,
						url: args.url,
						location: args.location,
						contactName: args.contact_name,
						contactEmail: args.contact_email,
						contactPhone: args.contact_phone,
						channel: args.channel,
						appliedOn: args.applied_on,
						nextStepOn: args.next_step_on,
						nextStepNote: args.next_step_note,
						notes: args.notes
					});
					return applicationOut(await updateApplication(owner.id, args.application_id, patch));
				})
		);

	if (allowed('set_application_status'))
		server.registerTool(
			'set_application_status',
			{
				title: 'Set application status',
				description:
					'Moves an application to a new status and writes it to the timeline. The first reaction of the company ("replied", "interview", "offer", "accepted", "rejected") marks it as responded. "accepted" means the person got the job and ends the running search. Use next_step_on / next_step_note for the next appointment or deadline.',
				inputSchema: z.object({
					person: personArg,
					application_id: z.number().int().positive(),
					status: z.enum(APPLICATION_STATUSES),
					note: z.string().max(2000).optional().describe('What happened, e.g. "Absage per Mail".'),
					occurred_on: date.optional().describe('When it happened; defaults to today.'),
					next_step_on: optionalDate,
					next_step_note: z.string().max(500).optional()
				}),
				annotations: { destructiveHint: false }
			},
			(args) =>
				guard(async () => {
					const owner = await personFor(args.person);
					const change = statusChangeSchema.parse({
						status: args.status,
						note: args.note,
						occurredOn: args.occurred_on,
						nextStepOn: args.next_step_on === undefined ? undefined : (args.next_step_on ?? ''),
						nextStepNote: args.next_step_note
					});
					return applicationOut(await setApplicationStatus(owner.id, args.application_id, change));
				})
		);

	if (allowed('add_application_note'))
		server.registerTool(
			'add_application_note',
			{
				title: 'Add note',
				description: 'Adds a note to the timeline of an application without changing its status.',
				inputSchema: z.object({
					person: personArg,
					application_id: z.number().int().positive(),
					note: z.string().trim().min(1).max(2000),
					occurred_on: date.optional()
				}),
				annotations: { destructiveHint: false }
			},
			({ person, application_id, note, occurred_on }) =>
				guard(async () => {
					const owner = await personFor(person);
					return eventOut(
						await addApplicationNote(owner.id, application_id, { note, occurredOn: occurred_on })
					);
				})
		);

	if (allowed('delete_application'))
		server.registerTool(
			'delete_application',
			{
				title: 'Delete application',
				description:
					'Permanently deletes an application and its timeline. Prefer set_application_status "withdrawn" unless the entry was created by mistake.',
				inputSchema: z.object({
					person: personArg,
					application_id: z.number().int().positive()
				}),
				annotations: { destructiveHint: true }
			},
			({ person, application_id }) =>
				guard(async () => {
					const owner = await personFor(person);
					await deleteApplication(owner.id, application_id);
					return { deleted: application_id };
				})
		);

	return server;
}
