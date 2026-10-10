import type { z } from 'zod';
import {
	APPLICATION_BUCKETS,
	APPLICATION_STATUS_LABELS,
	SEARCH_STATUS_LABELS,
	daysBetween,
	responseRate,
	todayVienna,
	type ApplicationBucket,
	type ApplicationStatus
} from '#lib/applications.js';
import type { ApplicationView, SearchView } from '#lib/server/applications/service.js';
import type { ApplicationEvent } from '#lib/server/db/schema.js';
import type {
	applicationFormSchema,
	noteFormSchema,
	searchFormSchema,
	statusFormSchema
} from './schema';

export type { ApplicationEvent, ApplicationView, SearchView };

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;
export type SearchFormData = z.infer<typeof searchFormSchema>;
export type StatusFormData = z.infer<typeof statusFormSchema>;
export type NoteFormData = z.infer<typeof noteFormSchema>;

/** Order of the quick status menu: reactions first, the bookkeeping statuses last. */
export const STATUS_MENU_ORDER: readonly ApplicationStatus[] = [
	'replied',
	'interview',
	'offer',
	'accepted',
	'rejected',
	'withdrawn',
	'applied',
	'planned'
];

const TERMINAL_STATUSES: readonly ApplicationStatus[] = ['accepted', 'rejected', 'withdrawn'];
const STRONG_STATUSES: readonly ApplicationStatus[] = ['interview', 'offer', 'accepted'];

/** After these statuses there is no next step any more. */
export function isTerminalStatus(status: ApplicationStatus): boolean {
	return TERMINAL_STATUSES.includes(status);
}

/** Statuses that deserve visual emphasis in the "Rückmeldungen" table. */
export function isStrongStatus(status: ApplicationStatus): boolean {
	return STRONG_STATUSES.includes(status);
}

/** Badge colours for accented statuses; the other statuses render as a quiet outline. */
export const STATUS_BADGE_CLASS: Partial<Record<ApplicationStatus, string>> = {
	replied: 'bg-primary/10 text-primary dark:bg-primary/20',
	interview: 'bg-primary text-primary-foreground',
	offer: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
	accepted: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
};

const viennaDate = new Intl.DateTimeFormat('de-AT', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	timeZone: 'Europe/Vienna'
});

/** `YYYY-MM-DD` strings and timestamps as `dd.mm.yyyy` (Vienna time). */
export function formatDate(value: string | Date | null | undefined): string {
	if (!value) return '–';
	if (value instanceof Date) return viennaDate.format(value);
	const [year, month, day] = value.split('-');
	return `${day}.${month}.${year}`;
}

export function daysAgoLabel(days: number | null): string {
	if (days === null) return '–';
	if (days === 0) return 'heute';
	if (days === 1) return 'gestern';
	return `vor ${days} Tagen`;
}

export function sinceDaysLabel(days: number | null): string {
	if (days === null) return '–';
	return days === 1 ? 'seit 1 Tag' : `seit ${days} Tagen`;
}

/** Whole days between a timestamp and `today` (Vienna), never negative. */
export function daysSince(occurredAt: Date, today: string): number {
	return Math.max(0, daysBetween(todayVienna(occurredAt), today));
}

export function isOverdue(
	application: Pick<ApplicationView, 'nextStepOn' | 'status'>,
	today: string
): boolean {
	return (
		application.nextStepOn !== null &&
		application.nextStepOn < today &&
		!isTerminalStatus(application.status)
	);
}

/** What happened last: the note when there is one, otherwise the status label. */
export function lastActivity(
	application: Pick<ApplicationView, 'lastEvent'>
): { text: string; occurredAt: Date } | null {
	const event = application.lastEvent;
	if (!event) return null;
	const note = event.note.trim();
	const label =
		event.kind === 'note'
			? 'Notiz'
			: event.status
				? APPLICATION_STATUS_LABELS[event.status]
				: 'Aktualisiert';
	return { text: note || label, occurredAt: event.occurredAt };
}

export function filterApplications(
	applications: readonly ApplicationView[],
	query: string
): ApplicationView[] {
	const needle = query.trim().toLocaleLowerCase('de-AT');
	if (!needle) return [...applications];
	return applications.filter((application) =>
		[application.companyName, application.positionTitle, application.location]
			.join(' ')
			.toLocaleLowerCase('de-AT')
			.includes(needle)
	);
}

export function groupByBucket(
	applications: readonly ApplicationView[]
): Record<ApplicationBucket, ApplicationView[]> {
	const groups = Object.fromEntries(
		APPLICATION_BUCKETS.map((bucket) => [bucket, [] as ApplicationView[]])
	) as Record<ApplicationBucket, ApplicationView[]>;
	for (const application of applications) groups[application.bucket].push(application);
	return groups;
}

export function episodeLabel(search: SearchView): string {
	const status = SEARCH_STATUS_LABELS[search.status];
	return search.status === 'found' && search.acceptedCompany
		? `${search.title} · ${status}: ${search.acceptedCompany}`
		: `${search.title} · ${status}`;
}

export function episodeRange(search: Pick<SearchView, 'startedOn' | 'endedOn'>): string {
	return search.endedOn
		? `${formatDate(search.startedOn)} – ${formatDate(search.endedOn)}`
		: `seit ${formatDate(search.startedOn)}`;
}

/** Share of sent applications that got a reaction, e.g. `25 %`; `–` when nothing was sent. */
export function formatResponseRate(search: Pick<SearchView, 'sent' | 'reacted'>): string {
	const rate = responseRate(search);
	return rate === null ? '–' : `${Math.round(rate * 100)} %`;
}

export function searchFormValues(search: SearchView | null, today: string): SearchFormData {
	return search
		? { id: search.id, title: search.title, goal: search.goal, notes: search.notes, startedOn: '' }
		: { title: `Jobsuche ${today.slice(0, 4)}`, goal: '', notes: '', startedOn: today };
}

export function applicationFormValues(
	application: ApplicationView | null,
	options: { searchId?: number; today: string }
): ApplicationFormData {
	if (application) {
		return {
			id: application.id,
			companyName: application.companyName,
			positionTitle: application.positionTitle,
			url: application.url,
			location: application.location,
			contactName: application.contactName,
			contactEmail: application.contactEmail,
			contactPhone: application.contactPhone,
			channel: application.channel,
			status: application.status,
			appliedOn: application.appliedOn ?? '',
			nextStepOn: application.nextStepOn ?? '',
			nextStepNote: application.nextStepNote,
			notes: application.notes
		};
	}
	return {
		searchId: options.searchId,
		companyName: '',
		positionTitle: '',
		url: '',
		location: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		channel: 'email',
		status: 'applied',
		appliedOn: options.today,
		nextStepOn: '',
		nextStepNote: '',
		notes: ''
	};
}

/**
 * The status action overwrites the next step with whatever it is sent, so the current
 * values are sent along unless the new status ends the application.
 */
export function statusFormValues(
	application: ApplicationView,
	status: ApplicationStatus,
	today: string
): StatusFormData {
	const keepNextStep = !isTerminalStatus(status);
	return {
		id: application.id,
		status,
		note: '',
		occurredOn: today,
		nextStepOn: keepNextStep ? (application.nextStepOn ?? '') : '',
		nextStepNote: keepNextStep ? application.nextStepNote : ''
	};
}
