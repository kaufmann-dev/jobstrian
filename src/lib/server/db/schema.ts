import {
	pgTable,
	serial,
	integer,
	text,
	boolean,
	timestamp,
	doublePrecision,
	jsonb,
	customType,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Certification, EducationHistory, WorkExperience } from '$lib/profile';
import type { OsmBusinessTag } from '$lib/search-config';

/** PostgreSQL bytea, surfaced as a Node Buffer. */
const bytea = customType<{ data: Buffer; default: false }>({
	dataType() {
		return 'bytea';
	}
});

// ---------------------------------------------------------------------------
// Better Auth core tables (email/password). Keep aligned with the Better Auth
// Drizzle schema; generated shape, do not hand-extend without the CLI.
// ---------------------------------------------------------------------------

export const user = pgTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: boolean('email_verified').default(false).notNull(),
		image: text('image'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	() => [uniqueIndex('user_singleton_idx').on(sql`(true)`)]
);

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('account_user_id_idx').on(table.userId)]
);

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/** Single-row app configuration (id = 1): profile, home location, LLM + sources. */
export const settings = pgTable('settings', {
	id: integer('id').primaryKey().default(1),
	// Profile the user defines for LLM ranking.
	profileText: text('profile_text').notNull().default(''),
	// Languages with levels, e.g. "Deutsch (A2)", "Englisch (B2)".
	languages: jsonb('languages').$type<string[]>().notNull().default([]),
	skills: jsonb('skills').$type<string[]>().notNull().default([]),
	workExperience: jsonb('work_experience').$type<WorkExperience[]>().notNull().default([]),
	educationHistory: jsonb('education_history').$type<EducationHistory[]>().notNull().default([]),
	certifications: jsonb('certifications').$type<Certification[]>().notNull().default([]),
	germanLevel: text('german_level').notNull().default(''), // e.g. "A2", "B1"
	experienceYears: integer('experience_years'), // years of relevant experience
	educationStatus: text('education_status').notNull().default(''),
	availability: text('availability').notNull().default(''),
	// Extra free-text instructions steering how the LLM weighs the ranking.
	rankingNotes: text('ranking_notes').notNull().default(''),
	// Home location for the nearby-business search.
	homeAddress: text('home_address').notNull().default(''),
	homeLat: doublePrecision('home_lat'),
	homeLon: doublePrecision('home_lon'),
	// Manual search configuration.
	jobSearchKeywords: jsonb('job_search_keywords').$type<string[]>().notNull().default([]),
	jobSearchLocations: jsonb('job_search_locations').$type<string[]>().notNull().default([]),
	businessOsmTags: jsonb('business_osm_tags').$type<OsmBusinessTag[]>().notNull().default([]),
	businessRadiusMeters: integer('business_radius_meters').notNull().default(5000),
	// Which scrape adapters are enabled.
	enabledSources: jsonb('enabled_sources').$type<string[]>().notNull().default([]),
	// OpenAI-compatible LLM config.
	llmBaseUrl: text('llm_base_url').notNull().default(''),
	llmApiKey: text('llm_api_key').notNull().default(''),
	llmModel: text('llm_model').notNull().default(''),
	llmRequestsPerMinute: integer('llm_requests_per_minute').notNull().default(300),
	llmMaxConcurrent: integer('llm_max_concurrent').notNull().default(50),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

/** The single uploaded CV (id = 1), stored as a blob for download/attachment. */
export const cv = pgTable('cv', {
	id: integer('id').primaryKey().default(1),
	filename: text('filename').notNull(),
	mimeType: text('mime_type').notNull(),
	size: integer('size').notNull(),
	data: bytea('data').notNull(),
	uploadedAt: timestamp('uploaded_at').defaultNow().notNull()
});

/** A full refresh execution; UI polls this for progress. */
export const scrapeRun = pgTable('scrape_run', {
	id: serial('id').primaryKey(),
	startedAt: timestamp('started_at').defaultNow().notNull(),
	finishedAt: timestamp('finished_at'),
	status: text('status', { enum: ['running', 'canceling', 'canceled', 'done', 'error'] })
		.notNull()
		.default('running'),
	cancelRequestedAt: timestamp('cancel_requested_at'),
	phase: text('phase').notNull().default('starting'),
	counts: jsonb('counts')
		.$type<{ added: number; closed: number; ranked: number; leads: number }>()
		.notNull()
		.default({ added: 0, closed: 0, ranked: 0, leads: 0 }),
	progress: jsonb('progress')
		.$type<RunProgress>()
		.notNull()
		.default(sql`'{}'::jsonb`),
	error: text('error')
});

/** A scraped job posting. */
export const listing = pgTable(
	'listing',
	{
		id: serial('id').primaryKey(),
		source: text('source').notNull(),
		externalId: text('external_id').notNull(),
		url: text('url').notNull(),
		title: text('title').notNull(),
		company: text('company'),
		location: text('location'),
		description: text('description'),
		salary: text('salary'),
		postedAt: timestamp('posted_at'),
		status: text('status', { enum: ['active', 'closed'] })
			.notNull()
			.default('active'),
		firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
		lastSeenRunId: integer('last_seen_run_id'),
		contentHash: text('content_hash'),
		// LLM ranking.
		rankScore: integer('rank_score'),
		rankVerdict: text('rank_verdict', { enum: ['strong', 'maybe', 'weak'] }),
		rankReason: text('rank_reason'),
		rankedAt: timestamp('ranked_at'),
		rankContentHash: text('rank_content_hash'),
		rankContextHash: text('rank_context_hash'),
		starred: boolean('starred').notNull().default(false)
	},
	(table) => [
		uniqueIndex('listing_source_external_id_idx').on(table.source, table.externalId),
		index('listing_status_idx').on(table.status),
		index('listing_rank_score_idx').on(table.rankScore),
		index('listing_order_idx').on(
			table.starred.desc(),
			table.rankScore.desc().nullsLast(),
			table.firstSeenAt.desc(),
			table.id.desc()
		)
	]
);

/** A nearby business (cold-email lead). */
export const lead = pgTable(
	'lead',
	{
		id: serial('id').primaryKey(),
		osmId: text('osm_id').notNull(),
		name: text('name').notNull(),
		category: text('category'),
		lat: doublePrecision('lat').notNull(),
		lon: doublePrecision('lon').notNull(),
		distanceMeters: integer('distance_meters').notNull(),
		address: text('address'),
		website: text('website'),
		websiteManual: boolean('website_manual').notNull().default(false),
		phone: text('phone'),
		phoneManual: boolean('phone_manual').notNull().default(false),
		email: text('email'),
		emailManual: boolean('email_manual').notNull().default(false),
		emailSource: text('email_source', { enum: ['osm', 'website', 'manual'] }),
		hasActivePosting: boolean('has_active_posting').notNull().default(false),
		rankScore: integer('rank_score'),
		rankReason: text('rank_reason'),
		draftSubject: text('draft_subject'),
		draftBody: text('draft_body'),
		status: text('status', { enum: ['new', 'contacted', 'ignored'] })
			.notNull()
			.default('new'),
		firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
		lastSeenRunId: integer('last_seen_run_id'),
		contentHash: text('content_hash'),
		rankContentHash: text('rank_content_hash'),
		rankContextHash: text('rank_context_hash'),
		draftContentHash: text('draft_content_hash'),
		draftContextHash: text('draft_context_hash'),
		starred: boolean('starred').notNull().default(false)
	},
	(table) => [
		uniqueIndex('lead_osm_id_idx').on(table.osmId),
		index('lead_distance_idx').on(table.distanceMeters),
		index('lead_order_idx').on(
			table.starred.desc(),
			table.rankScore.desc().nullsLast(),
			table.distanceMeters.asc(),
			table.id.asc()
		)
	]
);

export type Settings = typeof settings.$inferSelect;
export type Listing = typeof listing.$inferSelect;
export type Lead = typeof lead.$inferSelect;
export type ScrapeRun = typeof scrapeRun.$inferSelect;
export type Cv = typeof cv.$inferSelect;

export type RunStatus = 'running' | 'canceling' | 'canceled' | 'done' | 'error';
export type RunPhaseId =
	| 'setup'
	| 'scrape'
	| 'reconcile'
	| 'leads'
	| 'rank-listings'
	| 'rank-leads'
	| 'finalize';
export type RunPhaseState =
	| 'pending'
	| 'running'
	| 'done'
	| 'warning'
	| 'skipped'
	| 'error'
	| 'canceled';
export interface RunPhaseProgress {
	state: RunPhaseState;
	current: number;
	total: number;
	detail: string;
	skipped: number;
	failed: number;
}
export interface RunLlmProgress {
	requestsPerMinute: number;
	maxConcurrent: number;
	queued: number;
	inFlight: number;
	completed: number;
	failed: number;
	skipped: number;
	lastMinuteStarted: number;
}
export interface RunProgress {
	version: 1;
	headline: string;
	detail: string;
	phases: Record<RunPhaseId, RunPhaseProgress>;
	llm: RunLlmProgress;
}
