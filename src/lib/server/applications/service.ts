import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
	APPLICATION_BUCKETS,
	bucketOf,
	daysBetween,
	emptyBucketCounts,
	isReactionStatus,
	todayVienna,
	type ApplicationBucket,
	type ApplicationInput,
	type ApplicationPatch,
	type ApplicationStatus,
	type BucketCounts,
	type SearchInput,
	type SearchPatch,
	type StatusChange
} from '#lib/applications.js';
import { getAppSettings } from '../app-settings';
import { db } from '../db';
import {
	application,
	applicationEvent,
	applicationSearch,
	lead,
	listing,
	person,
	type Application,
	type ApplicationEvent,
	type ApplicationSearch
} from '../db/schema';

/** An error whose message is safe to show to the user and to MCP clients. */
export class ServiceError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
		this.name = 'ServiceError';
	}
}

export function isServiceError(error: unknown): error is ServiceError {
	return error instanceof ServiceError;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type ApplicationView = Application & {
	bucket: ApplicationBucket;
	/** Days since applying; null for planned applications. */
	daysSinceApplied: number | null;
	lastEvent: Pick<ApplicationEvent, 'kind' | 'status' | 'note' | 'occurredAt'> | null;
};

export type SearchView = ApplicationSearch & {
	bucketCounts: BucketCounts;
	/** Applications that were actually sent. */
	sent: number;
	/** Sent applications that got any reaction from the company, including rejections. */
	reacted: number;
	acceptedCompany: string | null;
};

async function ghostAfterDays(): Promise<number> {
	return (await getAppSettings()).ghostAfterDays;
}

function toView(
	row: Application,
	options: { ghostAfterDays: number; today: string },
	lastEvent: ApplicationView['lastEvent']
): ApplicationView {
	return {
		...row,
		bucket: bucketOf(row, options),
		daysSinceApplied: row.appliedOn ? Math.max(0, daysBetween(row.appliedOn, options.today)) : null,
		lastEvent
	};
}

async function lastEvents(
	executor: Executor,
	applicationIds: number[]
): Promise<Map<number, ApplicationView['lastEvent']>> {
	const map = new Map<number, ApplicationView['lastEvent']>();
	if (applicationIds.length === 0) return map;
	const rows = await executor
		.select()
		.from(applicationEvent)
		.where(inArray(applicationEvent.applicationId, applicationIds))
		.orderBy(desc(applicationEvent.occurredAt), desc(applicationEvent.id));
	for (const row of rows) {
		if (map.has(row.applicationId)) continue;
		map.set(row.applicationId, {
			kind: row.kind,
			status: row.status,
			note: row.note,
			occurredAt: row.occurredAt
		});
	}
	return map;
}

// ---------------------------------------------------------------------------
// Search episodes
// ---------------------------------------------------------------------------

export async function getActiveSearch(
	personId: number,
	executor: Executor = db
): Promise<ApplicationSearch | null> {
	const rows = await executor
		.select()
		.from(applicationSearch)
		.where(and(eq(applicationSearch.personId, personId), eq(applicationSearch.status, 'searching')))
		.limit(1);
	return rows[0] ?? null;
}

async function requireSearch(
	personId: number,
	searchId: number,
	executor: Executor = db
): Promise<ApplicationSearch> {
	const rows = await executor
		.select()
		.from(applicationSearch)
		.where(and(eq(applicationSearch.id, searchId), eq(applicationSearch.personId, personId)))
		.limit(1);
	if (!rows[0]) throw new ServiceError('Suche nicht gefunden.', 404);
	return rows[0];
}

export async function listSearches(personId: number): Promise<SearchView[]> {
	const [searches, rows, days] = await Promise.all([
		db
			.select()
			.from(applicationSearch)
			.where(eq(applicationSearch.personId, personId))
			.orderBy(desc(applicationSearch.startedOn), desc(applicationSearch.id)),
		db.select().from(application).where(eq(application.personId, personId)),
		ghostAfterDays()
	]);
	const today = todayVienna();
	return searches.map((search) => {
		const own = rows.filter((row) => row.searchId === search.id);
		const bucketCounts = emptyBucketCounts();
		let sent = 0;
		let reacted = 0;
		for (const row of own) {
			bucketCounts[bucketOf(row, { ghostAfterDays: days, today })]++;
			if (row.status !== 'planned') {
				sent++;
				if (row.respondedAt) reacted++;
			}
		}
		const accepted = own.find((row) => row.status === 'accepted');
		return {
			...search,
			bucketCounts,
			sent,
			reacted,
			acceptedCompany: accepted?.companyName ?? null
		};
	});
}

export async function createSearch(
	personId: number,
	input: SearchInput
): Promise<ApplicationSearch> {
	const active = await getActiveSearch(personId);
	if (active) {
		throw new ServiceError(
			`Es läuft bereits eine Suche („${active.title}“). Schließe sie zuerst ab.`,
			409
		);
	}
	const startedOn = input.startedOn ?? todayVienna();
	const inserted = await db
		.insert(applicationSearch)
		.values({
			personId,
			title: input.title,
			goal: input.goal,
			notes: input.notes,
			startedOn
		})
		.returning();
	return inserted[0];
}

export async function updateSearch(
	personId: number,
	searchId: number,
	patch: SearchPatch
): Promise<ApplicationSearch> {
	const current = await requireSearch(personId, searchId);
	const set: Partial<typeof applicationSearch.$inferInsert> = {};
	if (patch.title !== undefined) set.title = patch.title;
	if (patch.goal !== undefined) set.goal = patch.goal;
	if (patch.notes !== undefined) set.notes = patch.notes;
	if (patch.status !== undefined && patch.status !== current.status) {
		set.status = patch.status;
		if (patch.status === 'searching') {
			const active = await getActiveSearch(personId);
			if (active && active.id !== searchId) {
				throw new ServiceError(
					`Es läuft bereits eine Suche („${active.title}“). Schließe sie zuerst ab.`,
					409
				);
			}
			set.endedOn = null;
		} else {
			set.endedOn = patch.endedOn ?? current.endedOn ?? todayVienna();
		}
	} else if (patch.endedOn !== undefined && current.status !== 'searching') {
		set.endedOn = patch.endedOn;
	}
	if (Object.keys(set).length === 0) return current;
	const updated = await db
		.update(applicationSearch)
		.set(set)
		.where(eq(applicationSearch.id, searchId))
		.returning();
	return updated[0];
}

/** The running search of a person; starts "Jobsuche <year>" when none is running. */
export async function getOrCreateActiveSearch(
	personId: number,
	executor: Executor = db
): Promise<ApplicationSearch> {
	const active = await getActiveSearch(personId, executor);
	if (active) return active;
	const today = todayVienna();
	const inserted = await executor
		.insert(applicationSearch)
		.values({ personId, title: `Jobsuche ${today.slice(0, 4)}`, startedOn: today })
		.returning();
	return inserted[0];
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface ListApplicationsOptions {
	personId: number;
	searchId?: number;
	bucket?: ApplicationBucket | 'all';
	status?: ApplicationStatus;
	q?: string;
	limit?: number;
	cursor?: string | null;
}

export interface ListApplicationsResult {
	items: ApplicationView[];
	nextCursor: string | null;
	/** Counts over all applications of the selection, before the bucket filter. */
	bucketCounts: BucketCounts;
}

const MAX_PAGE = 100;

function compareNullable(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? -1 : 1;
}

function sortForBucket(bucket: ApplicationBucket, rows: ApplicationView[]): ApplicationView[] {
	const byActivity = (a: ApplicationView, b: ApplicationView) =>
		b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id;
	return [...rows].sort((a, b) => {
		if (bucket === 'responded')
			return compareNullable(a.nextStepOn, b.nextStepOn) || byActivity(a, b);
		if (bucket === 'ghosted') return compareNullable(a.appliedOn, b.appliedOn) || b.id - a.id;
		if (bucket === 'waiting')
			return (b.appliedOn ?? '').localeCompare(a.appliedOn ?? '') || b.id - a.id;
		return byActivity(a, b);
	});
}

function decodeOffset(cursor: string | null | undefined): number {
	if (!cursor) return 0;
	const value = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function listApplications(
	options: ListApplicationsOptions
): Promise<ListApplicationsResult> {
	const days = await ghostAfterDays();
	const today = todayVienna();
	const rows = await db
		.select()
		.from(application)
		.where(
			and(
				eq(application.personId, options.personId),
				options.searchId != null ? eq(application.searchId, options.searchId) : undefined
			)
		);
	const events = await lastEvents(
		db,
		rows.map((row) => row.id)
	);
	let views = rows.map((row) =>
		toView(row, { ghostAfterDays: days, today }, events.get(row.id) ?? null)
	);
	if (options.status) views = views.filter((view) => view.status === options.status);
	const needle = options.q?.trim().toLocaleLowerCase('de-AT');
	if (needle) {
		views = views.filter((view) =>
			[view.companyName, view.positionTitle, view.location, view.contactName, view.notes]
				.join(' ')
				.toLocaleLowerCase('de-AT')
				.includes(needle)
		);
	}
	const bucketCounts = emptyBucketCounts();
	for (const view of views) bucketCounts[view.bucket]++;

	const bucket = options.bucket ?? 'all';
	let selected: ApplicationView[];
	if (bucket === 'all') {
		selected = APPLICATION_BUCKETS.flatMap((name) =>
			sortForBucket(
				name,
				views.filter((view) => view.bucket === name)
			)
		);
	} else {
		selected = sortForBucket(
			bucket,
			views.filter((view) => view.bucket === bucket)
		);
	}
	const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE);
	const offset = decodeOffset(options.cursor);
	const items = selected.slice(offset, offset + limit);
	const next = offset + limit < selected.length ? offset + limit : null;
	return {
		items,
		nextCursor: next === null ? null : Buffer.from(String(next)).toString('base64url'),
		bucketCounts
	};
}

export async function getApplication(
	personId: number,
	applicationId: number
): Promise<{ application: ApplicationView; events: ApplicationEvent[] }> {
	const rows = await db
		.select()
		.from(application)
		.where(and(eq(application.id, applicationId), eq(application.personId, personId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw new ServiceError('Bewerbung nicht gefunden.', 404);
	const [events, days] = await Promise.all([
		db
			.select()
			.from(applicationEvent)
			.where(eq(applicationEvent.applicationId, applicationId))
			.orderBy(desc(applicationEvent.occurredAt), desc(applicationEvent.id)),
		ghostAfterDays()
	]);
	const last = events[0]
		? {
				kind: events[0].kind,
				status: events[0].status,
				note: events[0].note,
				occurredAt: events[0].occurredAt
			}
		: null;
	return { application: toView(row, { ghostAfterDays: days, today: todayVienna() }, last), events };
}

export interface CreateApplicationOptions {
	searchId?: number;
	source?: Application['source'];
	listingId?: number | null;
	leadId?: number | null;
}

function occurredAtFrom(date: string | undefined): Date {
	// Noon UTC stays on the same calendar day in Vienna in both summer and winter time.
	return date ? new Date(`${date}T12:00:00Z`) : new Date();
}

export async function createApplication(
	personId: number,
	input: ApplicationInput,
	options: CreateApplicationOptions = {}
): Promise<ApplicationView> {
	const id = await db.transaction(async (tx) => {
		const search = options.searchId
			? await requireSearch(personId, options.searchId, tx)
			: await getOrCreateActiveSearch(personId, tx);
		const today = todayVienna();
		const appliedOn = input.status === 'planned' ? input.appliedOn : (input.appliedOn ?? today);
		const now = new Date();
		const inserted = await tx
			.insert(application)
			.values({
				personId,
				searchId: search.id,
				companyName: input.companyName,
				positionTitle: input.positionTitle,
				url: input.url,
				location: input.location,
				contactName: input.contactName,
				contactEmail: input.contactEmail,
				contactPhone: input.contactPhone,
				channel: input.channel,
				status: input.status,
				appliedOn,
				respondedAt: isReactionStatus(input.status) ? now : null,
				nextStepOn: input.nextStepOn,
				nextStepNote: input.nextStepNote,
				notes: input.notes,
				source: options.source ?? 'manual',
				listingId: options.listingId ?? null,
				leadId: options.leadId ?? null
			})
			.returning({ id: application.id });
		await tx.insert(applicationEvent).values({
			applicationId: inserted[0].id,
			kind: 'status',
			status: input.status,
			note: 'Erfasst'
		});
		if (input.status === 'accepted') await markSearchFound(tx, search, todayVienna());
		return inserted[0].id;
	});
	return (await getApplication(personId, id)).application;
}

export async function updateApplication(
	personId: number,
	applicationId: number,
	patch: ApplicationPatch
): Promise<ApplicationView> {
	await getApplication(personId, applicationId);
	const set: Partial<typeof application.$inferInsert> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) Object.assign(set, { [key]: value });
	}
	if (Object.keys(set).length > 0) {
		await db.update(application).set(set).where(eq(application.id, applicationId));
	}
	return (await getApplication(personId, applicationId)).application;
}

async function markSearchFound(
	tx: Executor,
	search: ApplicationSearch,
	today: string
): Promise<void> {
	if (search.status !== 'searching') return;
	await tx
		.update(applicationSearch)
		.set({ status: 'found', endedOn: today })
		.where(eq(applicationSearch.id, search.id));
}

/**
 * Move an application to a new status: writes the timeline entry, stamps the first reaction
 * of the company and, for an accepted job, closes the search episode.
 */
export async function setApplicationStatus(
	personId: number,
	applicationId: number,
	change: StatusChange
): Promise<ApplicationView> {
	await db.transaction(async (tx) => {
		const rows = await tx
			.select()
			.from(application)
			.where(and(eq(application.id, applicationId), eq(application.personId, personId)))
			.limit(1)
			.for('update');
		const current = rows[0];
		if (!current) throw new ServiceError('Bewerbung nicht gefunden.', 404);
		const occurredAt = occurredAtFrom(change.occurredOn);
		const set: Partial<typeof application.$inferInsert> = { status: change.status };
		if (!current.respondedAt && isReactionStatus(change.status)) set.respondedAt = occurredAt;
		if (change.status !== 'planned' && !current.appliedOn) {
			set.appliedOn = change.occurredOn ?? todayVienna();
		}
		if (change.nextStepOn !== undefined) set.nextStepOn = change.nextStepOn;
		if (change.nextStepNote !== undefined) set.nextStepNote = change.nextStepNote;
		// A rejection or withdrawal ends the process, so an old appointment no longer applies.
		if (change.status === 'rejected' || change.status === 'withdrawn') {
			if (change.nextStepOn === undefined) set.nextStepOn = null;
			if (change.nextStepNote === undefined) set.nextStepNote = '';
		}
		await tx.update(application).set(set).where(eq(application.id, applicationId));
		await tx.insert(applicationEvent).values({
			applicationId,
			kind: 'status',
			status: change.status,
			note: change.note,
			occurredAt
		});
		if (change.status === 'accepted') {
			const search = await requireSearch(personId, current.searchId, tx);
			await markSearchFound(tx, search, change.occurredOn ?? todayVienna());
		}
	});
	return (await getApplication(personId, applicationId)).application;
}

export async function addApplicationNote(
	personId: number,
	applicationId: number,
	input: { note: string; occurredOn?: string }
): Promise<ApplicationEvent> {
	await getApplication(personId, applicationId);
	const inserted = await db
		.insert(applicationEvent)
		.values({
			applicationId,
			kind: 'note',
			note: input.note,
			occurredAt: occurredAtFrom(input.occurredOn)
		})
		.returning();
	await db
		.update(application)
		.set({ updatedAt: new Date() })
		.where(eq(application.id, applicationId));
	return inserted[0];
}

export async function deleteApplication(personId: number, applicationId: number): Promise<void> {
	const deleted = await db
		.delete(application)
		.where(and(eq(application.id, applicationId), eq(application.personId, personId)))
		.returning({ id: application.id });
	if (deleted.length === 0) throw new ServiceError('Bewerbung nicht gefunden.', 404);
}

// ---------------------------------------------------------------------------
// Links to Stellen / Betriebe
// ---------------------------------------------------------------------------

/** Application tied to a Betrieb, if one exists. */
export async function findApplicationForLead(
	personId: number,
	leadId: number
): Promise<Application | null> {
	const rows = await db
		.select()
		.from(application)
		.where(and(eq(application.leadId, leadId), eq(application.personId, personId)))
		.limit(1);
	return rows[0] ?? null;
}

export async function findApplicationForListing(
	personId: number,
	listingId: number
): Promise<Application | null> {
	const rows = await db
		.select()
		.from(application)
		.where(and(eq(application.listingId, listingId), eq(application.personId, personId)))
		.limit(1);
	return rows[0] ?? null;
}

/**
 * Record the application for a Betrieb after its email went out. Idempotent per lead and
 * placed in the person's running search (started automatically if none runs).
 */
export async function ensureApplicationForLead(leadId: number): Promise<ApplicationView> {
	const [row] = await db.select().from(lead).where(eq(lead.id, leadId)).limit(1);
	if (!row) throw new ServiceError('Betrieb nicht gefunden.', 404);
	const existing = await findApplicationForLead(row.personId, row.id);
	if (existing) return (await getApplication(row.personId, existing.id)).application;
	return createApplication(
		row.personId,
		{
			companyName: row.name,
			positionTitle: 'Initiativbewerbung',
			url: row.website ?? '',
			location: row.address ?? '',
			contactName: '',
			contactEmail: row.email ?? '',
			contactPhone: row.phone ?? '',
			channel: 'email',
			status: 'applied',
			appliedOn: todayVienna(),
			nextStepOn: null,
			nextStepNote: '',
			notes: ''
		},
		{ source: 'lead', leadId: row.id }
	);
}

/** Start an application from a Stelle; it begins as "Geplant" until the owner applies. */
export async function createApplicationFromListing(
	personId: number,
	listingId: number
): Promise<ApplicationView> {
	const [row] = await db
		.select()
		.from(listing)
		.where(and(eq(listing.id, listingId), eq(listing.personId, personId)))
		.limit(1);
	if (!row) throw new ServiceError('Stelle nicht gefunden.', 404);
	const existing = await findApplicationForListing(personId, listingId);
	if (existing) return (await getApplication(personId, existing.id)).application;
	return createApplication(
		personId,
		{
			companyName: row.company?.trim() || 'Unbekannte Firma',
			positionTitle: row.title,
			url: row.url,
			location: row.location ?? '',
			contactName: '',
			contactEmail: '',
			contactPhone: '',
			channel: 'portal',
			status: 'planned',
			appliedOn: null,
			nextStepOn: null,
			nextStepNote: '',
			notes: ''
		},
		{ source: 'listing', listingId: row.id }
	);
}

/** Application tied to a Betrieb of a person, created from the Betriebe sheet. */
export async function createApplicationFromLead(
	personId: number,
	leadId: number
): Promise<ApplicationView> {
	const [row] = await db
		.select()
		.from(lead)
		.where(and(eq(lead.id, leadId), eq(lead.personId, personId)))
		.limit(1);
	if (!row) throw new ServiceError('Betrieb nicht gefunden.', 404);
	const existing = await findApplicationForLead(personId, leadId);
	if (existing) return (await getApplication(personId, existing.id)).application;
	return createApplication(
		personId,
		{
			companyName: row.name,
			positionTitle: 'Initiativbewerbung',
			url: row.website ?? '',
			location: row.address ?? '',
			contactName: '',
			contactEmail: row.email ?? '',
			contactPhone: row.phone ?? '',
			channel: 'email',
			status: 'planned',
			appliedOn: null,
			nextStepOn: null,
			nextStepNote: '',
			notes: ''
		},
		{ source: 'lead', leadId: row.id }
	);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface PersonOverview {
	person: { id: number; slug: string; name: string; color: string };
	activeSearch: { id: number; title: string; startedOn: string } | null;
	bucketCounts: BucketCounts;
	sent: number;
	reacted: number;
	/** Rückmeldungen with an open next step (overdue first). */
	upcoming: {
		applicationId: number;
		companyName: string;
		positionTitle: string;
		status: ApplicationStatus;
		nextStepOn: string;
		nextStepNote: string;
		overdue: boolean;
	}[];
	/** Applications that crossed the ghost threshold within the last 7 days. */
	newlyGhosted: { applicationId: number; companyName: string; appliedOn: string }[];
}

/** Summary of the running search of one person, or of everybody when `personId` is omitted. */
export async function overview(personId?: number): Promise<PersonOverview[]> {
	const [people, days] = await Promise.all([
		db
			.select()
			.from(person)
			.where(personId != null ? eq(person.id, personId) : undefined)
			.orderBy(asc(person.id)),
		ghostAfterDays()
	]);
	const today = todayVienna();
	const result: PersonOverview[] = [];
	for (const owner of people) {
		const active = await getActiveSearch(owner.id);
		const rows = active
			? await db.select().from(application).where(eq(application.searchId, active.id))
			: [];
		const bucketCounts = emptyBucketCounts();
		let sent = 0;
		let reacted = 0;
		const upcoming: PersonOverview['upcoming'] = [];
		const newlyGhosted: PersonOverview['newlyGhosted'] = [];
		for (const row of rows) {
			const bucket = bucketOf(row, { ghostAfterDays: days, today });
			bucketCounts[bucket]++;
			if (row.status !== 'planned') {
				sent++;
				if (row.respondedAt) reacted++;
			}
			if (bucket === 'responded' && row.nextStepOn) {
				upcoming.push({
					applicationId: row.id,
					companyName: row.companyName,
					positionTitle: row.positionTitle,
					status: row.status,
					nextStepOn: row.nextStepOn,
					nextStepNote: row.nextStepNote,
					overdue: row.nextStepOn < today
				});
			}
			if (bucket === 'ghosted' && row.appliedOn) {
				const overBy = daysBetween(row.appliedOn, today) - days;
				if (overBy <= 7) {
					newlyGhosted.push({
						applicationId: row.id,
						companyName: row.companyName,
						appliedOn: row.appliedOn
					});
				}
			}
		}
		upcoming.sort((a, b) => a.nextStepOn.localeCompare(b.nextStepOn));
		result.push({
			person: { id: owner.id, slug: owner.slug, name: owner.name, color: owner.color },
			activeSearch: active
				? { id: active.id, title: active.title, startedOn: active.startedOn }
				: null,
			bucketCounts,
			sent,
			reacted,
			upcoming,
			newlyGhosted
		});
	}
	return result;
}

/** Total of applications in the Rückmeldungen bucket for quick dashboard badges. */
export async function respondedCount(personId: number): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(application)
		.where(
			and(
				eq(application.personId, personId),
				inArray(application.status, ['replied', 'interview', 'offer', 'accepted'])
			)
		);
	return row?.n ?? 0;
}

/** Timeline entries of every application of a search, newest first, keyed by application. */
export async function eventsForSearch(
	personId: number,
	searchId: number
): Promise<Record<number, ApplicationEvent[]>> {
	const rows = await db
		.select({ event: applicationEvent })
		.from(applicationEvent)
		.innerJoin(application, eq(application.id, applicationEvent.applicationId))
		.where(and(eq(application.personId, personId), eq(application.searchId, searchId)))
		.orderBy(desc(applicationEvent.occurredAt), desc(applicationEvent.id));
	const grouped: Record<number, ApplicationEvent[]> = {};
	for (const { event } of rows) (grouped[event.applicationId] ??= []).push(event);
	return grouped;
}
