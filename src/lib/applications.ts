import { z } from 'zod';

export const SEARCH_STATUSES = ['searching', 'found', 'paused', 'stopped'] as const;
export const APPLICATION_STATUSES = [
	'planned',
	'applied',
	'replied',
	'interview',
	'offer',
	'accepted',
	'rejected',
	'withdrawn'
] as const;
export const APPLICATION_CHANNELS = ['email', 'portal', 'post', 'persoenlich', 'other'] as const;
export const APPLICATION_SOURCES = ['manual', 'listing', 'lead', 'mcp'] as const;

export type SearchStatus = (typeof SEARCH_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number];
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const SEARCH_STATUS_LABELS: Record<SearchStatus, string> = {
	searching: 'Läuft',
	found: 'Stelle gefunden',
	paused: 'Pausiert',
	stopped: 'Beendet'
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
	planned: 'Geplant',
	applied: 'Beworben',
	replied: 'Antwort erhalten',
	interview: 'Gespräch',
	offer: 'Angebot',
	accepted: 'Zusage angenommen',
	rejected: 'Absage',
	withdrawn: 'Zurückgezogen'
};

export const APPLICATION_CHANNEL_LABELS: Record<ApplicationChannel, string> = {
	email: 'E-Mail',
	portal: 'Portal',
	post: 'Post',
	persoenlich: 'Persönlich',
	other: 'Sonstiges'
};

/**
 * Where an application shows up. "Beworben" alone is no progress, because most employers
 * never answer: only a real reaction puts an application into `responded`.
 */
export const APPLICATION_BUCKETS = [
	'responded',
	'waiting',
	'ghosted',
	'closed',
	'planned'
] as const;
export type ApplicationBucket = (typeof APPLICATION_BUCKETS)[number];

export const APPLICATION_BUCKET_LABELS: Record<ApplicationBucket, string> = {
	responded: 'Rückmeldungen',
	waiting: 'Wartet',
	ghosted: 'Keine Antwort',
	closed: 'Abgeschlossen',
	planned: 'Geplant'
};

/** Statuses that mean the company has actually reacted. */
const REACTION_STATUSES: readonly ApplicationStatus[] = [
	'replied',
	'interview',
	'offer',
	'accepted',
	'rejected'
];

/** Statuses that keep an application in the highlighted "Rückmeldungen" view. */
const RESPONDED_STATUSES: readonly ApplicationStatus[] = [
	'replied',
	'interview',
	'offer',
	'accepted'
];

export const DEFAULT_GHOST_AFTER_DAYS = 21;

export function isReactionStatus(status: ApplicationStatus): boolean {
	return REACTION_STATUSES.includes(status);
}

/** Today in Vienna as `YYYY-MM-DD`. */
export function todayVienna(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Europe/Vienna',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface BucketInput {
	status: ApplicationStatus;
	appliedOn: string | null;
}

export function bucketOf(
	application: BucketInput,
	options: { ghostAfterDays: number; today: string }
): ApplicationBucket {
	const { status } = application;
	if (status === 'planned') return 'planned';
	if (RESPONDED_STATUSES.includes(status)) return 'responded';
	if (status === 'rejected' || status === 'withdrawn') return 'closed';
	const age = application.appliedOn ? daysBetween(application.appliedOn, options.today) : 0;
	return age > options.ghostAfterDays ? 'ghosted' : 'waiting';
}

/** Days since applying, or null when not applied yet. */
export function daysSinceApplied(appliedOn: string | null, today: string): number | null {
	return appliedOn ? Math.max(0, daysBetween(appliedOn, today)) : null;
}

export type BucketCounts = Record<ApplicationBucket, number>;

export function emptyBucketCounts(): BucketCounts {
	return { responded: 0, waiting: 0, ghosted: 0, closed: 0, planned: 0 };
}

/** Share of sent applications that got any reaction (including rejections), 0..1. */
export function responseRate(counts: { sent: number; reacted: number }): number | null {
	return counts.sent > 0 ? counts.reacted / counts.sent : null;
}

const optionalDate = z.union([z.iso.date(), z.literal('')]).transform((v) => (v === '' ? null : v));
const text = (max: number) => z.string().trim().max(max);
const urlText = z
	.string()
	.trim()
	.max(1000)
	.refine(
		(v) => v === '' || /^https?:\/\//i.test(v),
		'Die Adresse muss mit http:// oder https:// beginnen.'
	);
const emailText = z.union([z.literal(''), z.email('Ungültige E-Mail-Adresse.').max(200)]);

export const searchInputSchema = z.object({
	title: text(120).min(1, 'Titel fehlt.'),
	goal: text(500).default(''),
	notes: text(5000).default(''),
	startedOn: z.iso.date().optional()
});

export const searchPatchSchema = z.object({
	title: text(120).min(1, 'Titel fehlt.').optional(),
	goal: text(500).optional(),
	notes: text(5000).optional(),
	status: z.enum(SEARCH_STATUSES).optional(),
	endedOn: z.iso.date().nullable().optional()
});

export const applicationInputSchema = z.object({
	companyName: text(200).min(1, 'Firma fehlt.'),
	positionTitle: text(200).default(''),
	url: urlText.default(''),
	location: text(200).default(''),
	contactName: text(200).default(''),
	contactEmail: emailText.default(''),
	contactPhone: text(50).default(''),
	channel: z.enum(APPLICATION_CHANNELS).default('email'),
	status: z.enum(APPLICATION_STATUSES).default('applied'),
	appliedOn: optionalDate.default(null),
	nextStepOn: optionalDate.default(null),
	nextStepNote: text(500).default(''),
	notes: text(5000).default('')
});

export const applicationPatchSchema = z.object({
	companyName: text(200).min(1, 'Firma fehlt.').optional(),
	positionTitle: text(200).optional(),
	url: urlText.optional(),
	location: text(200).optional(),
	contactName: text(200).optional(),
	contactEmail: emailText.optional(),
	contactPhone: text(50).optional(),
	channel: z.enum(APPLICATION_CHANNELS).optional(),
	appliedOn: optionalDate.optional(),
	nextStepOn: optionalDate.optional(),
	nextStepNote: text(500).optional(),
	notes: text(5000).optional()
});

export const statusChangeSchema = z.object({
	status: z.enum(APPLICATION_STATUSES),
	note: text(2000).default(''),
	occurredOn: z.iso.date().optional(),
	nextStepOn: optionalDate.optional(),
	nextStepNote: text(500).optional()
});

export const noteSchema = z.object({
	note: text(2000).min(1, 'Notiz fehlt.'),
	occurredOn: z.iso.date().optional()
});

export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchPatch = z.infer<typeof searchPatchSchema>;
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
