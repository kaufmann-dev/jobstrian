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
	date,
	primaryKey,
	uniqueIndex,
	index,
	check,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
	APPLICATION_CHANNELS,
	APPLICATION_SOURCES,
	APPLICATION_STATUSES,
	SEARCH_STATUSES
} from '#lib/applications.js';
import type { Certification, EducationHistory, WorkExperience } from '#lib/profile.js';
import type { OsmBusinessTag, OsmBusinessTagSuggestion } from '#lib/search-config.js';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA,
	type RankFactor,
	type RankingCriteria
} from '#lib/ranking-criteria.js';

/** PostgreSQL bytea, surfaced as a Node Buffer. */
const bytea = customType<{ data: Buffer; default: false }>({
	dataType() {
		return 'bytea';
	}
});

// ---------------------------------------------------------------------------
// Better Auth core tables (OIDC with local server-side sessions). Keep aligned
// with the Better Auth Drizzle schema and the auth configuration.
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
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
});

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
		lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
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
	(table) => [
		index('account_user_id_idx').on(table.userId),
		uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId)
	]
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
// OAuth 2.1 authorization server for MCP clients (Better Auth `mcp` + `jwt` plugins)
// ---------------------------------------------------------------------------

export const jwks = pgTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: timestamp('created_at').notNull(),
	expiresAt: timestamp('expires_at'),
	alg: text('alg'),
	crv: text('crv')
});

export const oauthClient = pgTable(
	'oauth_client',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id').notNull().unique(),
		clientSecret: text('client_secret'),
		clientDiscoveryId: text('client_discovery_id'),
		disabled: boolean('disabled').default(false),
		skipConsent: boolean('skip_consent'),
		enableEndSession: boolean('enable_end_session'),
		subjectType: text('subject_type'),
		scopes: text('scopes').array(),
		clientCredentialsScopes: text('client_credentials_scopes').array().default([]),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),
		name: text('name'),
		uri: text('uri'),
		icon: text('icon'),
		contacts: text('contacts').array(),
		tos: text('tos'),
		policy: text('policy'),
		softwareId: text('software_id'),
		softwareVersion: text('software_version'),
		softwareStatement: text('software_statement'),
		redirectUris: text('redirect_uris').array().notNull(),
		postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
		backchannelLogoutUri: text('backchannel_logout_uri'),
		backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
		tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
		applicationType: text('application_type'),
		jwks: text('jwks'),
		jwksUri: text('jwks_uri'),
		grantTypes: text('grant_types').array(),
		responseTypes: text('response_types').array(),
		requirePKCE: boolean('require_pkce'),
		dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
		referenceId: text('reference_id'),
		metadata: jsonb('metadata')
	},
	(table) => [index('oauthClient_userId_idx').on(table.userId)]
);

export const oauthResource = pgTable('oauth_resource', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull().unique(),
	name: text('name').notNull(),
	accessTokenTtl: integer('access_token_ttl'),
	refreshTokenTtl: integer('refresh_token_ttl'),
	signingAlgorithm: text('signing_algorithm'),
	signingKeyId: text('signing_key_id'),
	allowedScopes: text('allowed_scopes').array(),
	customClaims: jsonb('custom_claims'),
	dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
	disabled: boolean('disabled').default(false),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at'),
	policyVersion: integer('policy_version').default(1),
	metadata: jsonb('metadata')
});

export const oauthClientResource = pgTable(
	'oauth_client_resource',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		resourceId: text('resource_id')
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: 'cascade' }),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at')
	},
	(table) => [
		uniqueIndex('oauthClientResource_clientId_resourceId_uidx').on(
			table.clientId,
			table.resourceId
		),
		index('oauthClientResource_clientId_idx').on(table.clientId),
		index('oauthClientResource_resourceId_idx').on(table.resourceId)
	]
);

export const oauthRefreshToken = pgTable(
	'oauth_refresh_token',
	{
		id: text('id').primaryKey(),
		token: text('token').notNull().unique(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => session.id, {
			onDelete: 'set null'
		}),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		authorizationCodeId: text('authorization_code_id'),
		resources: text('resources').array(),
		requestedUserInfoClaims: text('requested_user_info_claims').array(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').notNull(),
		revoked: timestamp('revoked'),
		rotatedAt: timestamp('rotated_at'),
		rotationReplayResponse: text('rotation_replay_response'),
		rotationReplayExpiresAt: timestamp('rotation_replay_expires_at'),
		authTime: timestamp('auth_time'),
		confirmation: jsonb('confirmation'),
		scopes: text('scopes').array().notNull()
	},
	(table) => [
		index('oauthRefreshToken_clientId_idx').on(table.clientId),
		index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
		index('oauthRefreshToken_userId_idx').on(table.userId),
		index('oauthRefreshToken_authorizationCodeId_idx').on(table.authorizationCodeId)
	]
);

export const oauthAccessToken = pgTable(
	'oauth_access_token',
	{
		id: text('id').primaryKey(),
		token: text('token').notNull().unique(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		sessionId: text('session_id').references(() => session.id, {
			onDelete: 'set null'
		}),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		authorizationCodeId: text('authorization_code_id'),
		resources: text('resources').array(),
		requestedUserInfoClaims: text('requested_user_info_claims').array(),
		refreshId: text('refresh_id').references(() => oauthRefreshToken.id, {
			onDelete: 'cascade'
		}),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').notNull(),
		revoked: timestamp('revoked'),
		confirmation: jsonb('confirmation'),
		scopes: text('scopes').array().notNull()
	},
	(table) => [
		index('oauthAccessToken_clientId_idx').on(table.clientId),
		index('oauthAccessToken_sessionId_idx').on(table.sessionId),
		index('oauthAccessToken_userId_idx').on(table.userId),
		index('oauthAccessToken_authorizationCodeId_idx').on(table.authorizationCodeId),
		index('oauthAccessToken_refreshId_idx').on(table.refreshId)
	]
);

export const oauthConsent = pgTable(
	'oauth_consent',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('reference_id'),
		resources: text('resources').array(),
		requestedUserInfoClaims: text('requested_user_info_claims').array(),
		scopes: text('scopes').array().notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull()
	},
	(table) => [
		index('oauthConsent_clientId_idx').on(table.clientId),
		index('oauthConsent_userId_idx').on(table.userId)
	]
);

export const oauthClientAssertion = pgTable('oauth_client_assertion', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull()
});

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	oauthClients: many(oauthClient),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent)
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken)
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}));

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
	user: one(user, {
		fields: [oauthClient.userId],
		references: [user.id]
	}),
	oauthClientResources: many(oauthClientResource),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent)
}));

export const oauthResourceRelations = relations(oauthResource, ({ many }) => ({
	oauthClientResources: many(oauthClientResource)
}));

export const oauthClientResourceRelations = relations(oauthClientResource, ({ one }) => ({
	oauthClient: one(oauthClient, {
		fields: [oauthClientResource.clientId],
		references: [oauthClient.clientId]
	}),
	oauthResource: one(oauthResource, {
		fields: [oauthClientResource.resourceId],
		references: [oauthResource.identifier]
	})
}));

export const oauthRefreshTokenRelations = relations(oauthRefreshToken, ({ one, many }) => ({
	oauthClient: one(oauthClient, {
		fields: [oauthRefreshToken.clientId],
		references: [oauthClient.clientId]
	}),
	session: one(session, {
		fields: [oauthRefreshToken.sessionId],
		references: [session.id]
	}),
	user: one(user, {
		fields: [oauthRefreshToken.userId],
		references: [user.id]
	}),
	oauthAccessTokens: many(oauthAccessToken)
}));

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
	oauthClient: one(oauthClient, {
		fields: [oauthAccessToken.clientId],
		references: [oauthClient.clientId]
	}),
	session: one(session, {
		fields: [oauthAccessToken.sessionId],
		references: [session.id]
	}),
	user: one(user, {
		fields: [oauthAccessToken.userId],
		references: [user.id]
	}),
	oauthRefreshToken: one(oauthRefreshToken, {
		fields: [oauthAccessToken.refreshId],
		references: [oauthRefreshToken.id]
	})
}));

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
	oauthClient: one(oauthClient, {
		fields: [oauthConsent.clientId],
		references: [oauthClient.clientId]
	}),
	user: one(user, {
		fields: [oauthConsent.userId],
		references: [user.id]
	})
}));

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/**
 * An applicant the owner applies for (themself, family, friends). Holds the person's
 * profile, search configuration, ranking criteria and their own Resend email setup.
 * Nearly every other table is scoped to a person.
 */
export const person = pgTable('person', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	// URL segment (/p/<slug>); derived from the name once and never changed.
	slug: text('slug').notNull().unique(),
	// Accent colour token (see PERSON_COLORS in #lib/people.ts).
	color: text('color').notNull().default('amber'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	// Selected LLM model; null falls back to the app default model.
	llmModelId: integer('llm_model_id').references((): AnyPgColumn => llmModel.id, {
		onDelete: 'set null'
	}),
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
	// Applicant's own contact data (used to sign generated cold emails).
	fullName: text('full_name').notNull().default(''),
	phone: text('phone').notNull().default(''),
	email: text('email').notNull().default(''),
	// Deterministic weighted criteria used by the LLM ranking flow.
	listingRankingCriteria: jsonb('listing_ranking_criteria')
		.$type<RankingCriteria>()
		.notNull()
		.default(DEFAULT_LISTING_RANKING_CRITERIA),
	leadRankingCriteria: jsonb('lead_ranking_criteria')
		.$type<RankingCriteria>()
		.notNull()
		.default(DEFAULT_LEAD_RANKING_CRITERIA),
	// Home location for the nearby-business search.
	homeAddress: text('home_address').notNull().default(''),
	homeLocationProvider: text('home_location_provider'),
	homeLocationId: text('home_location_id'),
	homePostcode: text('home_postcode').notNull().default(''),
	homeCity: text('home_city').notNull().default(''),
	homeLat: doublePrecision('home_lat'),
	homeLon: doublePrecision('home_lon'),
	// Manual search configuration.
	jobSearchKeywords: jsonb('job_search_keywords').$type<string[]>().notNull().default([]),
	jobSearchLocations: jsonb('job_search_locations').$type<string[]>().notNull().default([]),
	businessOsmTags: jsonb('business_osm_tags').$type<OsmBusinessTag[]>().notNull().default([]),
	businessRadiusMeters: integer('business_radius_meters').notNull().default(5000),
	// Which scrape adapters are enabled.
	enabledSources: jsonb('enabled_sources').$type<string[]>().notNull().default([]),
	// Resend-backed automatic application emails.
	resendApiKey: text('resend_api_key').notNull().default(''),
	resendDomain: text('resend_domain').notNull().default(''),
	resendDomainId: text('resend_domain_id'),
	resendDomainStatus: text('resend_domain_status').notNull().default('not_started'),
	resendDnsRecords: jsonb('resend_dns_records')
		.$type<ApplicationEmailDnsRecord[]>()
		.notNull()
		.default([]),
	resendDnsVerifiedAt: timestamp('resend_dns_verified_at'),
	resendFromLocalPart: text('resend_from_local_part').notNull().default('bewerbung'),
	resendFromName: text('resend_from_name').notNull().default(''),
	resendReplyTo: text('resend_reply_to').notNull().default(''),
	resendWebhookSecret: text('resend_webhook_secret').notNull().default(''),
	applicationEmailEnabled: boolean('application_email_enabled').notNull().default(false),
	applicationEmailDailyLimit: integer('application_email_daily_limit').notNull().default(90),
	applicationEmailSendOnWeekends: boolean('application_email_send_on_weekends')
		.notNull()
		.default(false),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

/** App-wide singleton (id = 1). */
export const appSettings = pgTable('app_settings', {
	id: integer('id').primaryKey().default(1),
	defaultLlmModelId: integer('default_llm_model_id').references((): AnyPgColumn => llmModel.id, {
		onDelete: 'set null'
	}),
	// An application without any reply after this many days counts as ghosted.
	ghostAfterDays: integer('ghost_after_days').notNull().default(21),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

/** A saved AI API connection (shared by all people). */
export const llmConnection = pgTable(
	'llm_connection',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		apiType: text('api_type', { enum: ['openai', 'anthropic', 'openai-compatible'] }).notNull(),
		baseUrl: text('base_url').notNull(),
		apiKey: text('api_key').notNull().default(''),
		requestsPerMinute: integer('requests_per_minute').notNull().default(300),
		maxConcurrent: integer('max_concurrent').notNull().default(50),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		check(
			'llm_connection_api_type_check',
			sql`${table.apiType} in ('openai', 'anthropic', 'openai-compatible')`
		)
	]
);

/** A model saved for a connection. `verified` is set only by a successful live request. */
export const llmModel = pgTable(
	'llm_model',
	{
		id: serial('id').primaryKey(),
		connectionId: integer('connection_id')
			.notNull()
			.references(() => llmConnection.id, { onDelete: 'cascade' }),
		modelId: text('model_id').notNull(),
		verified: boolean('verified').notNull().default(false),
		verifiedAt: timestamp('verified_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [uniqueIndex('llm_model_connection_model_idx').on(table.connectionId, table.modelId)]
);

/** The uploaded CV of a person, stored as a blob for download/attachment. */
export const cv = pgTable('cv', {
	personId: integer('person_id')
		.primaryKey()
		.references(() => person.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	mimeType: text('mime_type').notNull(),
	size: integer('size').notNull(),
	data: bytea('data').notNull(),
	uploadedAt: timestamp('uploaded_at').defaultNow().notNull()
});

/** A full refresh execution; UI polls this for progress. */
export const scrapeRun = pgTable(
	'scrape_run',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
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
	},
	(table) => [index('scrape_run_person_idx').on(table.personId, table.id.desc())]
);

/** A scraped job posting (belongs to one person). */
export const listing = pgTable(
	'listing',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		source: text('source').notNull(),
		externalId: text('external_id').notNull(),
		url: text('url').notNull(),
		title: text('title').notNull(),
		company: text('company'),
		location: text('location'),
		description: text('description'),
		salary: text('salary'),
		postedAt: timestamp('posted_at'),
		discoveryKeyword: text('discovery_keyword'),
		discoveryCity: text('discovery_city'),
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
		rankFactors: jsonb('rank_factors').$type<RankFactor[]>(),
		rankedAt: timestamp('ranked_at'),
		rankContentHash: text('rank_content_hash'),
		rankContextHash: text('rank_context_hash'),
		starred: boolean('starred').notNull().default(false)
	},
	(table) => [
		uniqueIndex('listing_person_source_external_id_idx').on(
			table.personId,
			table.source,
			table.externalId
		),
		index('listing_status_idx').on(table.status),
		index('listing_rank_score_idx').on(table.rankScore),
		index('listing_order_idx').on(
			table.personId,
			table.starred.desc(),
			table.rankScore.desc().nullsLast(),
			table.firstSeenAt.desc(),
			table.id.desc()
		)
	]
);

/** A nearby business (cold-email lead) of one person. */
export const lead = pgTable(
	'lead',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		osmId: text('osm_id').notNull(),
		name: text('name').notNull(),
		category: text('category'),
		lat: doublePrecision('lat').notNull(),
		lon: doublePrecision('lon').notNull(),
		distanceMeters: integer('distance_meters').notNull(),
		address: text('address'),
		matchedOsmTags: jsonb('matched_osm_tags')
			.$type<OsmBusinessTagSuggestion[]>()
			.notNull()
			.default([]),
		website: text('website'),
		websiteManual: boolean('website_manual').notNull().default(false),
		phone: text('phone'),
		phoneManual: boolean('phone_manual').notNull().default(false),
		email: text('email'),
		emailManual: boolean('email_manual').notNull().default(false),
		emailSource: text('email_source', { enum: ['osm', 'website', 'manual'] }),
		emailQualityStatus: text('email_quality_status', {
			enum: ['unchecked', 'accepted', 'rejected']
		})
			.notNull()
			.default('unchecked'),
		emailQualityReason: text('email_quality_reason'),
		emailQualityCheckedAt: timestamp('email_quality_checked_at'),
		hasActivePosting: boolean('has_active_posting').notNull().default(false),
		rankScore: integer('rank_score'),
		rankReason: text('rank_reason'),
		rankFactors: jsonb('rank_factors').$type<RankFactor[]>(),
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
		uniqueIndex('lead_person_osm_id_idx').on(table.personId, table.osmId),
		index('lead_distance_idx').on(table.distanceMeters),
		index('lead_order_idx').on(
			table.personId,
			table.starred.desc(),
			table.rankScore.desc().nullsLast(),
			table.distanceMeters.asc(),
			table.id.asc()
		)
	]
);

export const applicationEmailRun = pgTable(
	'application_email_run',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at').defaultNow().notNull(),
		finishedAt: timestamp('finished_at'),
		status: text('status', { enum: ['running', 'canceling', 'canceled', 'done', 'error'] })
			.notNull()
			.default('running'),
		cancelRequestedAt: timestamp('cancel_requested_at'),
		phase: text('phase').notNull().default('starting'),
		counts: jsonb('counts')
			.$type<{ queued: number; sent: number; failed: number; skipped: number }>()
			.notNull()
			.default({ queued: 0, sent: 0, failed: 0, skipped: 0 }),
		progress: jsonb('progress')
			.$type<ApplicationEmailProgress>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		error: text('error')
	},
	(table) => [index('application_email_run_person_idx').on(table.personId, table.id.desc())]
);

export const applicationEmail = pgTable(
	'application_email',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		runId: integer('run_id').references(() => applicationEmailRun.id, { onDelete: 'set null' }),
		leadId: integer('lead_id')
			.notNull()
			.references(() => lead.id, { onDelete: 'cascade' }),
		recipientEmail: text('recipient_email').notNull(),
		leadName: text('lead_name').notNull(),
		subject: text('subject').notNull(),
		body: text('body').notNull(),
		status: text('status', {
			enum: ['queued', 'sending', 'sent', 'failed', 'skipped', 'canceled']
		})
			.notNull()
			.default('queued'),
		scheduledAt: timestamp('scheduled_at').notNull(),
		sentAt: timestamp('sent_at'),
		attempts: integer('attempts').notNull().default(0),
		resendEmailId: text('resend_email_id'),
		idempotencyKey: text('idempotency_key').notNull(),
		error: text('error'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('application_email_lead_id_idx').on(table.leadId),
		uniqueIndex('application_email_idempotency_key_idx').on(table.idempotencyKey),
		index('application_email_status_scheduled_idx').on(table.status, table.scheduledAt),
		index('application_email_run_id_idx').on(table.runId),
		index('application_email_person_idx').on(table.personId)
	]
);

export const applicationEmailSuppression = pgTable(
	'application_email_suppression',
	{
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		reason: text('reason').notNull(),
		sourceApplicationEmailId: integer('source_application_email_id').references(
			() => applicationEmail.id,
			{ onDelete: 'set null' }
		),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [primaryKey({ columns: [table.personId, table.email] })]
);

export const resendWebhookEvent = pgTable('resend_webhook_event', {
	id: text('id').primaryKey(),
	type: text('type').notNull(),
	payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

// ---------------------------------------------------------------------------
// Application tracker (Bewerbungen)
// ---------------------------------------------------------------------------

/** One job-search episode of a person ("Jobsuche 2026"). Getting a job ends it. */
export const applicationSearch = pgTable(
	'application_search',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		goal: text('goal').notNull().default(''),
		notes: text('notes').notNull().default(''),
		status: text('status', { enum: SEARCH_STATUSES }).notNull().default('searching'),
		startedOn: date('started_on', { mode: 'string' }).notNull(),
		endedOn: date('ended_on', { mode: 'string' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('application_search_person_idx').on(table.personId, table.startedOn.desc()),
		// At most one running search episode per person.
		uniqueIndex('application_search_one_active_idx')
			.on(table.personId)
			.where(sql`${table.status} = 'searching'`)
	]
);

/** One application to one company within a search episode. */
export const application = pgTable(
	'application',
	{
		id: serial('id').primaryKey(),
		personId: integer('person_id')
			.notNull()
			.references(() => person.id, { onDelete: 'cascade' }),
		searchId: integer('search_id')
			.notNull()
			.references(() => applicationSearch.id, { onDelete: 'cascade' }),
		companyName: text('company_name').notNull(),
		positionTitle: text('position_title').notNull().default(''),
		url: text('url').notNull().default(''),
		location: text('location').notNull().default(''),
		contactName: text('contact_name').notNull().default(''),
		contactEmail: text('contact_email').notNull().default(''),
		contactPhone: text('contact_phone').notNull().default(''),
		channel: text('channel', { enum: APPLICATION_CHANNELS }).notNull().default('email'),
		status: text('status', { enum: APPLICATION_STATUSES }).notNull().default('applied'),
		appliedOn: date('applied_on', { mode: 'string' }),
		// First real reaction from the company; never set by "applied" alone.
		respondedAt: timestamp('responded_at'),
		nextStepOn: date('next_step_on', { mode: 'string' }),
		nextStepNote: text('next_step_note').notNull().default(''),
		notes: text('notes').notNull().default(''),
		source: text('source', { enum: APPLICATION_SOURCES }).notNull().default('manual'),
		listingId: integer('listing_id').references(() => listing.id, { onDelete: 'set null' }),
		leadId: integer('lead_id').references(() => lead.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('application_search_idx').on(table.searchId),
		index('application_person_status_idx').on(table.personId, table.status),
		uniqueIndex('application_lead_idx').on(table.leadId),
		uniqueIndex('application_listing_idx').on(table.listingId)
	]
);

/** Timeline entry of an application (status change or note). */
export const applicationEvent = pgTable(
	'application_event',
	{
		id: serial('id').primaryKey(),
		applicationId: integer('application_id')
			.notNull()
			.references(() => application.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['status', 'note'] }).notNull(),
		status: text('status', { enum: APPLICATION_STATUSES }),
		note: text('note').notNull().default(''),
		occurredAt: timestamp('occurred_at').defaultNow().notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('application_event_application_idx').on(table.applicationId, table.occurredAt)]
);

export type Person = typeof person.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type LlmConnection = typeof llmConnection.$inferSelect;
export type LlmModel = typeof llmModel.$inferSelect;
export type ApplicationSearch = typeof applicationSearch.$inferSelect;
export type Application = typeof application.$inferSelect;
export type ApplicationEvent = typeof applicationEvent.$inferSelect;
export type Listing = typeof listing.$inferSelect;
export type Lead = typeof lead.$inferSelect;
export type ScrapeRun = typeof scrapeRun.$inferSelect;
export type Cv = typeof cv.$inferSelect;
export type ApplicationEmailRun = typeof applicationEmailRun.$inferSelect;
export type ApplicationEmail = typeof applicationEmail.$inferSelect;

export type RunStatus = 'running' | 'canceling' | 'canceled' | 'done' | 'error';
export type RunPhaseId =
	| 'setup'
	| 'scrape'
	| 'reconcile'
	| 'enrich'
	| 'leads'
	| 'email-quality'
	| 'rank-listings'
	| 'rank-leads'
	| 'finalize';
export type RunPhaseState =
	'pending' | 'running' | 'done' | 'warning' | 'skipped' | 'error' | 'canceled';
export interface RunPhaseFailureReason {
	code: string;
	label: string;
	count: number;
}
export interface RunPhaseProgress {
	state: RunPhaseState;
	current: number;
	total: number;
	detail: string;
	skipped: number;
	failed: number;
	/** Per-cause breakdown of `failed`, most frequent first. Absent on old runs. */
	failureReasons?: RunPhaseFailureReason[];
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

export type ApplicationEmailDnsRecord = {
	record: string;
	name: string;
	type: string;
	value: string;
	ttl: string;
	status: string;
	priority?: number;
};

export type ApplicationEmailRunStatus = 'running' | 'canceling' | 'canceled' | 'done' | 'error';
export type ApplicationEmailStatus =
	'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'canceled';
export type ApplicationEmailPhaseId = 'setup' | 'queue' | 'send' | 'finalize';
export interface ApplicationEmailPhaseProgress {
	state: RunPhaseState;
	current: number;
	total: number;
	detail: string;
	skipped: number;
	failed: number;
}
export interface ApplicationEmailProgress {
	version: 1;
	headline: string;
	detail: string;
	nextSendAt: string | null;
	phases: Record<ApplicationEmailPhaseId, ApplicationEmailPhaseProgress>;
}
