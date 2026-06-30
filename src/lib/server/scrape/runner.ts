import { and, eq, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import {
	listing,
	lead,
	scrapeRun,
	type Lead,
	type RunPhaseId,
	type RunPhaseProgress,
	type RunProgress,
	type Settings
} from '../db/schema';
import { getSettings } from '../settings';
import { reconcileLeads, syncLeads } from '../geo/leads';
import { OverpassUnavailableError } from '../geo/overpass';
import { getLlmConfig, LlmNotConfiguredError, type LlmConfig } from '../llm/client';
import {
	draftContextHash,
	listingContentHash,
	planLeadLlmWork,
	rankingContextHash,
	rawListingContentHash,
	shouldRankListing
} from '../llm/fingerprints';
import { isAbortError, LlmLimiter } from '../llm/limiter';
import { rankListing, rankLead } from '../llm/rank';
import { draftColdEmail } from '../llm/draft-email';
import {
	leadEmailQualityHash,
	reviewLeadEmailCandidates,
	type LeadEmailQualityCandidate
} from '../llm/email-quality';
import { mapLimit } from '../util/concurrency';
import { createRunProgress } from '../../run-progress';
import { closeBrowser } from './browser';
import { ADAPTERS, getEnabledAdapters, BROWSER_ADAPTERS } from './registry';
import type { ProfileQuery, RawListing } from './types';

/** Bounded concurrency for polite per-listing detail-page fetches. */
const DETAIL_FETCH_CONCURRENCY = 5;

const PROGRESS_FLUSH_INTERVAL_MS = 1000;

type Counts = { added: number; closed: number; ranked: number; leads: number };
type ActiveRun = { runId: number; controller: AbortController; startedAt: Date };

let activeRun: ActiveRun | null = null;
// Claimed synchronously by startRefresh before its first await so two concurrent
// start requests cannot both pass the "already running" check and launch two runs.
let starting = false;

export function isRunning(): boolean {
	return activeRun !== null;
}

export function hasActiveRun(runId?: number): boolean {
	return activeRun !== null && (runId == null || activeRun.runId === runId);
}

export const createProgress = createRunProgress;

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortReason(signal);
}

function isAbortLike(err: unknown): boolean {
	return isAbortError(err) || (err instanceof Error && /aborted|abort/i.test(err.message));
}

class ProgressWriter {
	private lastFlush = 0;
	private limiter: LlmLimiter | null = null;

	constructor(
		private readonly runId: number,
		private readonly counts: Counts,
		readonly progress: RunProgress
	) {}

	phase(id: RunPhaseId, patch: Partial<RunPhaseProgress>, headline?: string): void {
		this.progress.phases[id] = { ...this.progress.phases[id], ...patch };
		if (headline) this.progress.headline = headline;
		if (patch.detail != null) this.progress.detail = patch.detail;
	}

	setLimiter(limiter: LlmLimiter): void {
		this.limiter = limiter;
		this.llm();
	}

	llm(): void {
		if (this.limiter) this.progress.llm = this.limiter.metrics();
	}

	cancelRunning(): void {
		for (const id of Object.keys(this.progress.phases) as RunPhaseId[]) {
			const phase = this.progress.phases[id];
			if (phase.state === 'running') {
				this.phase(id, { state: 'canceled', detail: 'Abgebrochen' });
			}
		}
		this.progress.headline = 'Aktualisierung abgebrochen';
		this.progress.detail = 'Der Lauf wurde abgebrochen.';
	}

	async flush(force = false): Promise<void> {
		const now = Date.now();
		if (!force && now - this.lastFlush < PROGRESS_FLUSH_INTERVAL_MS) return;
		this.lastFlush = now;
		this.llm();
		await db
			.update(scrapeRun)
			.set({ phase: this.progress.headline, counts: this.counts, progress: this.progress })
			.where(eq(scrapeRun.id, this.runId));
	}
}

/** Upsert a scraped listing; returns true if newly inserted. */
async function upsertListing(source: string, r: RawListing, runId: number): Promise<boolean> {
	const contentHash = rawListingContentHash(source, r);
	const res = await db
		.insert(listing)
		.values({
			source,
			externalId: r.externalId,
			url: r.url,
			title: r.title,
			company: r.company,
			location: r.location,
			description: r.description,
			salary: r.salary,
			postedAt: r.postedAt,
			discoveryKeyword: r.discoveryKeyword,
			discoveryCity: r.discoveryCity,
			status: 'active',
			lastSeenRunId: runId,
			contentHash
		})
		.onConflictDoUpdate({
			target: [listing.source, listing.externalId],
			set: {
				url: r.url,
				title: r.title,
				company: r.company,
				location: r.location,
				description: r.description ?? sql`${listing.description}`,
				salary: r.salary,
				postedAt: r.postedAt,
				discoveryKeyword: r.discoveryKeyword,
				discoveryCity: r.discoveryCity,
				status: 'active',
				lastSeenRunId: runId,
				contentHash
			}
		})
		.returning({ inserted: sql<boolean>`(xmax = 0)` });
	return res[0]?.inserted === true;
}

export function hasVerifiedHomeLocation(
	settings: Pick<
		Settings,
		'homeLocationProvider' | 'homeLocationId' | 'homeCity' | 'homeLat' | 'homeLon'
	>
): boolean {
	return Boolean(
		settings.homeLocationProvider &&
		settings.homeLocationId &&
		settings.homeCity.trim() &&
		settings.homeLat != null &&
		settings.homeLon != null
	);
}

export function jobSearchLocations(
	settings: Pick<
		Settings,
		| 'jobSearchLocations'
		| 'homeLocationProvider'
		| 'homeLocationId'
		| 'homeCity'
		| 'homeLat'
		| 'homeLon'
	>
): string[] {
	if (settings.jobSearchLocations.length) return settings.jobSearchLocations;
	if (!hasVerifiedHomeLocation(settings)) return [];
	const city = settings.homeCity.trim();
	return city ? [city] : [];
}

export function buildProfileQuery(
	settings: Pick<
		Settings,
		| 'jobSearchKeywords'
		| 'jobSearchLocations'
		| 'homeLocationProvider'
		| 'homeLocationId'
		| 'homeCity'
		| 'homeLat'
		| 'homeLon'
	>
): ProfileQuery | null {
	const keywords = settings.jobSearchKeywords;
	const locations = jobSearchLocations(settings);
	if (keywords.length === 0 || locations.length === 0) return null;
	return { keywords, locations };
}

function scrapeSkipDetail(settings: Settings, adapters: readonly unknown[]): string {
	if (adapters.length === 0) return 'Keine Quellen aktiviert';
	if (settings.jobSearchKeywords.length === 0) return 'Keine Stellen-Keywords konfiguriert';
	return 'Kein Job-Suchort aus Konfiguration oder Adresse ableitbar';
}

export interface ListingSearchScope {
	source: string;
	city: string;
}

export function listingSearchScopes(
	sources: readonly string[],
	cities: readonly string[]
): ListingSearchScope[] {
	const seen = new Set<string>();
	const scopes: ListingSearchScope[] = [];
	for (const source of sources) {
		for (const city of cities) {
			const trimmedCity = city.trim();
			if (!trimmedCity) continue;
			const key = `${source}\u0000${trimmedCity}`;
			if (seen.has(key)) continue;
			seen.add(key);
			scopes.push({ source, city: trimmedCity });
		}
	}
	return scopes;
}

export function listingReconcileWhere(
	runId: number,
	scopes: readonly ListingSearchScope[]
): SQL | undefined {
	if (scopes.length === 0) return undefined;
	return and(
		eq(listing.status, 'active'),
		or(isNull(listing.lastSeenRunId), ne(listing.lastSeenRunId, runId)),
		or(
			...scopes.map(
				(scope) => and(eq(listing.source, scope.source), eq(listing.discoveryCity, scope.city))!
			)
		)
	);
}

/** Flag leads whose business name matches an active listing's company. */
async function markLeadsWithPostings(): Promise<void> {
	await db.execute(sql`
		update ${lead} l set has_active_posting = exists (
			select 1 from ${listing} j
			where j.status = 'active' and length(trim(j.company)) > 0
			and (position(lower(l.name) in lower(j.company)) > 0
			     or position(lower(j.company) in lower(l.name)) > 0)
		)
	`);
}

export async function runRefresh(
	runId: number,
	signal: AbortSignal,
	progress = createProgress()
): Promise<void> {
	const counts: Counts = { added: 0, closed: 0, ranked: 0, leads: 0 };
	const writer = new ProgressWriter(runId, counts, progress);
	let usesBrowser = false;
	let finalDetail = '';
	// Only sources that finished without any swallowed fetch failure are eligible
	// for reconciliation; a partially-failed source must not close its listings.
	const completeSources = new Set<string>();

	try {
		const settings = await getSettings();
		const limiter = new LlmLimiter({
			requestsPerMinute: settings.llmRequestsPerMinute,
			maxConcurrent: settings.llmMaxConcurrent
		});
		writer.setLimiter(limiter);
		const profile = buildProfileQuery(settings);
		throwIfAborted(signal);

		writer.phase('setup', { state: 'done', current: 1, total: 1, detail: 'Einstellungen geladen' });
		await writer.flush(true);

		const adapters = getEnabledAdapters(settings.enabledSources);
		const canScrape = adapters.length > 0 && profile != null;
		writer.phase(
			'scrape',
			{
				state: canScrape ? 'running' : 'skipped',
				current: 0,
				total: adapters.length,
				detail: canScrape ? 'Quellen werden abgefragt' : scrapeSkipDetail(settings, adapters)
			},
			'Stellen werden gesucht'
		);
		await writer.flush(true);

		if (profile) {
			for (const [index, adapter] of adapters.entries()) {
				throwIfAborted(signal);
				if (BROWSER_ADAPTERS.has(adapter.id)) usesBrowser = true;
				const detail = `${adapter.label}: ${index + 1} / ${adapters.length} Quellen`;
				writer.phase('scrape', {
					state: 'running',
					current: index,
					total: adapters.length,
					detail
				});
				await writer.flush(true);

				const { listings, complete } = await adapter.search(profile, signal);
				if (complete) completeSources.add(adapter.id);
				for (const raw of listings) {
					throwIfAborted(signal);
					if (await upsertListing(adapter.id, raw, runId)) counts.added++;
				}
				writer.phase('scrape', { current: index + 1, detail });
				await writer.flush(true);
			}
		}
		if (canScrape) {
			writer.phase('scrape', {
				state: 'done',
				current: adapters.length,
				total: adapters.length,
				detail: `${adapters.length} Quellen abgefragt`
			});
		}

		writer.phase(
			'reconcile',
			{ state: 'running', current: 0, total: 1, detail: 'Geschlossene Stellen werden erkannt' },
			'Stellen werden abgeglichen'
		);
		await writer.flush(true);
		if (profile && completeSources.size > 0) {
			const scopes = listingSearchScopes([...completeSources], profile.locations);
			const where = listingReconcileWhere(runId, scopes);
			if (where) {
				const closed = await db
					.update(listing)
					.set({ status: 'closed' })
					.where(where)
					.returning({ id: listing.id });
				counts.closed = closed.length;
			}
		}
		const incompleteSources = profile ? adapters.length - completeSources.size : 0;
		writer.phase('reconcile', {
			state: 'done',
			current: 1,
			total: 1,
			detail:
				`${counts.closed} nicht mehr verfügbare Stellen erkannt` +
				(incompleteSources > 0
					? ` (${incompleteSources} unvollständige Quelle${incompleteSources === 1 ? '' : 'n'} übersprungen)`
					: '')
		});
		await writer.flush(true);

		await enrichDescriptions(writer, signal);

		writer.phase(
			'leads',
			{ state: 'running', current: 0, total: 1, detail: 'Betriebe in der Nähe werden gesucht' },
			'Betriebe werden gesucht'
		);
		await writer.flush(true);
		if (settings.businessOsmTags.length === 0) {
			writer.phase('leads', {
				state: 'skipped',
				current: 1,
				total: 1,
				detail: 'Keine Betriebskategorien konfiguriert',
				skipped: 1
			});
		} else if (hasVerifiedHomeLocation(settings)) {
			try {
				const leadResult = await syncLeads(settings, runId, signal);
				counts.leads = leadResult.total;
				await markLeadsWithPostings();
				const removedLeads = await reconcileLeads(runId);
				writer.phase('leads', {
					state: 'done',
					current: 1,
					total: 1,
					detail:
						`${leadResult.total} Betriebe gefunden` +
						(removedLeads > 0 ? `, ${removedLeads} veraltete entfernt` : '')
				});
			} catch (err) {
				if (isAbortLike(err)) throw err;
				if (!(err instanceof OverpassUnavailableError)) throw err;
				console.warn('[runner] nearby business sync skipped:', err.message);
				finalDetail = `Betriebe übersprungen (${err.message})`;
				writer.phase('leads', {
					state: 'skipped',
					current: 1,
					total: 1,
					detail: finalDetail,
					skipped: 1
				});
			}
		} else {
			writer.phase('leads', {
				state: 'skipped',
				current: 1,
				total: 1,
				detail: 'Wohnort fehlt',
				skipped: 1
			});
		}
		await writer.flush(true);

		await rankAll(settings, limiter, counts, writer, signal);

		writer.phase(
			'finalize',
			{ state: 'done', current: 1, total: 1, detail: finalDetail || 'Fertig' },
			finalDetail ? `Fertig - ${finalDetail}` : 'Aktualisierung abgeschlossen'
		);
		writer.progress.detail = finalDetail || 'Fertig';
		await writer.flush(true);

		await db
			.update(scrapeRun)
			.set({
				status: 'done',
				phase: writer.progress.headline,
				finishedAt: new Date(),
				counts,
				progress: writer.progress
			})
			.where(eq(scrapeRun.id, runId));
	} catch (err) {
		if (isAbortLike(err) || signal.aborted) {
			writer.cancelRunning();
			await writer.flush(true);
			await db
				.update(scrapeRun)
				.set({
					status: 'canceled',
					phase: 'Abgebrochen',
					finishedAt: new Date(),
					counts,
					progress: writer.progress
				})
				.where(eq(scrapeRun.id, runId));
			return;
		}

		console.error('[runner] Lauf fehlgeschlagen:', err);
		writer.progress.headline = 'Aktualisierung fehlgeschlagen';
		writer.progress.detail = err instanceof Error ? err.message : String(err);
		for (const id of Object.keys(writer.progress.phases) as RunPhaseId[]) {
			const phase = writer.progress.phases[id];
			if (phase.state === 'running') {
				writer.phase(id, {
					state: 'error',
					detail: writer.progress.detail,
					failed: phase.failed + 1
				});
			}
		}
		await writer.flush(true);
		await db
			.update(scrapeRun)
			.set({
				status: 'error',
				phase: 'Fehler',
				finishedAt: new Date(),
				counts,
				progress: writer.progress,
				error: err instanceof Error ? err.message : String(err)
			})
			.where(eq(scrapeRun.id, runId));
	} finally {
		if (usesBrowser) await closeBrowser();
	}
}

/**
 * Fetch full job-ad bodies for active listings that still lack a description,
 * via each source's `fetchDescription`. Fills `description` and recomputes the
 * content hash so the rank-listings phase re-evaluates the listing with real
 * requirement text. Sources without a detail fetcher (e.g. AMS, which carries
 * the body in its search response) are skipped. Each detail page is fetched at
 * most once across runs because already-filled descriptions are not re-selected.
 */
async function enrichDescriptions(writer: ProgressWriter, signal: AbortSignal): Promise<void> {
	const rows = await db
		.select()
		.from(listing)
		.where(and(eq(listing.status, 'active'), isNull(listing.description)));
	const work = rows.filter((row) => typeof ADAPTERS[row.source]?.fetchDescription === 'function');
	const skipped = rows.length - work.length;
	let completed = 0;
	let failed = 0;

	writer.phase(
		'enrich',
		{
			state: work.length > 0 ? 'running' : 'skipped',
			current: 0,
			total: work.length,
			detail: `Beschreibungen geladen: 0 / ${work.length}`,
			skipped,
			failed
		},
		'Stellenbeschreibungen werden geladen'
	);
	await writer.flush(true);

	await mapLimit(
		work,
		DETAIL_FETCH_CONCURRENCY,
		async (row) => {
			throwIfAborted(signal);
			try {
				const description = await ADAPTERS[row.source]!.fetchDescription!(row.url, signal);
				if (description) {
					await db
						.update(listing)
						.set({ description, contentHash: listingContentHash({ ...row, description }) })
						.where(eq(listing.id, row.id));
					completed++;
				}
			} catch (err) {
				if (isAbortLike(err)) throw err;
				failed++;
				console.error(`[runner] Anreicherung der Stelle ${row.id} fehlgeschlagen:`, err);
			} finally {
				writer.phase('enrich', {
					current: completed + failed,
					total: work.length,
					detail: `Beschreibungen geladen: ${completed} / ${work.length}, fehlgeschlagen: ${failed}`,
					skipped,
					failed
				});
				await writer.flush();
			}
		},
		signal
	);

	if (work.length > 0) {
		writer.phase('enrich', {
			state: failed > 0 ? 'warning' : 'done',
			current: work.length,
			total: work.length,
			detail: `Beschreibungen geladen: ${completed} / ${work.length}, fehlgeschlagen: ${failed}`,
			skipped,
			failed
		});
		await writer.flush(true);
	}
}

async function rankAll(
	settings: Settings,
	limiter: LlmLimiter,
	counts: Counts,
	writer: ProgressWriter,
	signal: AbortSignal
): Promise<void> {
	let cfg: LlmConfig;
	try {
		cfg = await getLlmConfig(settings);
	} catch (err) {
		if (err instanceof LlmNotConfiguredError) {
			writer.phase('email-quality', {
				state: 'skipped',
				current: 0,
				total: 0,
				detail: 'LLM nicht konfiguriert',
				skipped: 1
			});
			writer.phase(
				'rank-listings',
				{
					state: 'skipped',
					current: 0,
					total: 0,
					detail: 'LLM nicht konfiguriert',
					skipped: 1
				},
				'Ranking übersprungen'
			);
			writer.phase('rank-leads', {
				state: 'skipped',
				current: 0,
				total: 0,
				detail: 'LLM nicht konfiguriert',
				skipped: 1
			});
			await writer.flush(true);
			return;
		}
		throw err;
	}

	const rankContext = rankingContextHash(settings, cfg);
	const draftContext = draftContextHash(settings, cfg);
	await reviewAutomaticLeadEmails(cfg, limiter, writer, signal);
	await rankListings(settings, cfg, limiter, rankContext, counts, writer, signal);
	await rankLeads(settings, cfg, limiter, rankContext, draftContext, writer, signal);
}

async function reviewAutomaticLeadEmails(
	cfg: LlmConfig,
	limiter: LlmLimiter,
	writer: ProgressWriter,
	signal: AbortSignal
): Promise<void> {
	const rows = await db
		.select()
		.from(lead)
		.where(and(isNotNull(lead.email), eq(lead.emailManual, false)));
	const rowsById = new Map(rows.map((row) => [row.id, row]));
	const allCandidates = rows
		.filter((row) => row.emailSource === 'osm' || row.emailSource === 'website')
		.map(
			(row): LeadEmailQualityCandidate => ({
				id: row.id,
				name: row.name,
				category: row.category,
				website: row.website,
				email: row.email!,
				emailSource: row.emailSource as 'osm' | 'website'
			})
		);
	const candidates = allCandidates.filter((candidate) => {
		const qualityHash = leadEmailQualityHash(candidate);
		const row = rowsById.get(candidate.id);
		if (!row) return true;
		return (
			row.emailQualityHash !== qualityHash ||
			(row.emailQualityStatus !== 'accepted' && row.emailQualityStatus !== 'rejected')
		);
	});
	const skipped = allCandidates.length - candidates.length;

	if (allCandidates.length === 0) {
		writer.phase(
			'email-quality',
			{
				state: 'skipped',
				current: 0,
				total: 0,
				detail: 'Keine automatischen E-Mail-Adressen zu prüfen',
				skipped: 0,
				failed: 0
			},
			'E-Mail-Prüfung übersprungen'
		);
		await writer.flush(true);
		return;
	}
	if (candidates.length === 0) {
		writer.phase(
			'email-quality',
			{
				state: 'done',
				current: allCandidates.length,
				total: allCandidates.length,
				detail: `E-Mail-Adressen geprüft: 0 / ${allCandidates.length}, übersprungen: ${skipped}, akzeptiert: 0, abgelehnt: 0`,
				skipped,
				failed: 0
			},
			'E-Mail-Adressen geprüft'
		);
		await writer.flush(true);
		return;
	}

	let latestAccepted = 0;
	let latestRejected = 0;
	let latestFailedBatches = 0;
	const emailQualityDetail = (reviewed: number) =>
		`E-Mail-Adressen geprüft: ${reviewed} / ${allCandidates.length}, übersprungen: ${skipped}, akzeptiert: ${latestAccepted}, abgelehnt: ${latestRejected}` +
		(latestFailedBatches > 0 ? `, fehlgeschlagene Batches: ${latestFailedBatches}` : '');

	writer.phase(
		'email-quality',
		{
			state: 'running',
			current: skipped,
			total: allCandidates.length,
			detail: emailQualityDetail(0),
			skipped,
			failed: 0
		},
		'E-Mail-Adressen werden geprüft'
	);
	await writer.flush(true);

	const reviewedAt = new Date();
	const results = await reviewLeadEmailCandidates(
		cfg,
		candidates,
		limiter,
		signal,
		async (progress) => {
			latestAccepted = progress.accepted;
			latestRejected = progress.rejected;
			latestFailedBatches = progress.failedBatches;
			writer.phase('email-quality', {
				state: 'running',
				current: skipped + progress.reviewed,
				total: allCandidates.length,
				detail: emailQualityDetail(progress.reviewed),
				skipped,
				failed: progress.failedBatches
			});
			await writer.flush();
		}
	);
	for (const result of results) {
		const row = rowsById.get(result.id);
		if (!row?.email) continue;
		if (result.status === 'rejected') {
			await db
				.update(lead)
				.set({
					email: null,
					emailSource: null,
					emailQualityStatus: 'rejected',
					emailQualityHash: result.hash,
					emailQualityReason: result.reason,
					emailQualityCheckedAt: reviewedAt,
					contentHash: null,
					draftSubject: null,
					draftBody: null,
					draftContentHash: null,
					draftContextHash: null
				})
				.where(and(eq(lead.id, result.id), eq(lead.email, row.email), eq(lead.emailManual, false)));
		} else {
			await db
				.update(lead)
				.set({
					emailQualityStatus: 'accepted',
					emailQualityHash: result.hash,
					emailQualityReason: result.reason,
					emailQualityCheckedAt: reviewedAt
				})
				.where(and(eq(lead.id, result.id), eq(lead.email, row.email), eq(lead.emailManual, false)));
		}
	}
	writer.phase(
		'email-quality',
		{
			state: latestFailedBatches > 0 ? 'warning' : 'done',
			current: allCandidates.length,
			total: allCandidates.length,
			detail: emailQualityDetail(results.length),
			skipped,
			failed: latestFailedBatches
		},
		latestFailedBatches > 0 ? 'E-Mail-Prüfung mit Warnung abgeschlossen' : 'E-Mail-Adressen geprüft'
	);
	await writer.flush(true);
}

async function rankListings(
	settings: Settings,
	cfg: LlmConfig,
	limiter: LlmLimiter,
	contextHash: string,
	counts: Counts,
	writer: ProgressWriter,
	signal: AbortSignal
): Promise<void> {
	const rows = await db.select().from(listing).where(eq(listing.status, 'active'));
	const work = rows
		.map((row) => ({ row, contentHash: row.contentHash ?? listingContentHash(row) }))
		.filter(({ row, contentHash }) => shouldRankListing(row, contextHash, contentHash));
	const skipped = rows.length - work.length;
	let completed = 0;
	let failed = 0;

	writer.phase(
		'rank-listings',
		{
			state: rows.length > 0 ? 'running' : 'skipped',
			current: skipped,
			total: rows.length,
			detail: `Stellen bewertet: 0 / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: 0`,
			skipped,
			failed
		},
		'Stellen werden bewertet'
	);
	await writer.flush(true);

	await mapLimit(
		work,
		settings.llmMaxConcurrent,
		async ({ row, contentHash }) => {
			throwIfAborted(signal);
			try {
				const result = await rankListing(cfg, settings, row, limiter, signal);
				await db
					.update(listing)
					.set({
						rankScore: result.score,
						rankVerdict: result.verdict,
						rankReason: result.reason,
						rankFactors: result.factors,
						rankedAt: new Date(),
						contentHash,
						rankContentHash: contentHash,
						rankContextHash: contextHash
					})
					.where(eq(listing.id, row.id));
				counts.ranked++;
				completed++;
			} catch (err) {
				if (isAbortLike(err)) throw err;
				failed++;
				console.error(`[runner] Bewertung der Stelle ${row.id} fehlgeschlagen:`, err);
			} finally {
				const current = skipped + completed + failed;
				writer.phase('rank-listings', {
					current,
					total: rows.length,
					detail: `Stellen bewertet: ${completed} / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: ${failed}`,
					skipped,
					failed
				});
				await writer.flush();
			}
		},
		signal
	);

	writer.phase('rank-listings', {
		state: failed > 0 ? 'warning' : 'done',
		current: rows.length,
		total: rows.length,
		detail: `Stellen bewertet: ${completed} / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: ${failed}`,
		skipped,
		failed
	});
	await writer.flush(true);
}

async function rankLeads(
	settings: Settings,
	cfg: LlmConfig,
	limiter: LlmLimiter,
	rankContext: string,
	draftContext: string,
	writer: ProgressWriter,
	signal: AbortSignal
): Promise<void> {
	const rows = await db.select().from(lead);
	const planned = rows.map((row) => planLeadLlmWork(row, rankContext, draftContext));
	const work = planned.filter((item) => item.rank || item.draft);
	const skipped = planned.length - work.length;
	let completed = 0;
	let failed = 0;

	writer.phase(
		'rank-leads',
		{
			state: rows.length > 0 ? 'running' : 'skipped',
			current: skipped,
			total: rows.length,
			detail: `Betriebe bewertet: 0 / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: 0`,
			skipped,
			failed
		},
		'Betriebe werden bewertet'
	);
	await writer.flush(true);

	await mapLimit(
		work,
		settings.llmMaxConcurrent,
		async ({ row, contentHash, rank, draft }) => {
			throwIfAborted(signal);
			try {
				const update: Partial<Lead> = {
					contentHash
				};
				if (rank) {
					const result = await rankLead(cfg, settings, row, limiter, signal);
					update.rankScore = result.score;
					update.rankReason = result.reason;
					update.rankFactors = result.factors;
					update.rankContentHash = contentHash;
					update.rankContextHash = rankContext;
				}
				if (draft) {
					const result = await draftColdEmail(cfg, settings, row, limiter, signal);
					update.draftSubject = result.subject;
					update.draftBody = result.body;
					update.draftContentHash = contentHash;
					update.draftContextHash = draftContext;
				}
				await db.update(lead).set(update).where(eq(lead.id, row.id));
				completed++;
			} catch (err) {
				if (isAbortLike(err)) throw err;
				failed++;
				console.error(`[runner] Bewertung des Betriebs ${row.id} fehlgeschlagen:`, err);
			} finally {
				const current = skipped + completed + failed;
				writer.phase('rank-leads', {
					current,
					total: rows.length,
					detail: `Betriebe bewertet: ${completed} / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: ${failed}`,
					skipped,
					failed
				});
				await writer.flush();
			}
		},
		signal
	);

	writer.phase('rank-leads', {
		state: failed > 0 ? 'warning' : 'done',
		current: rows.length,
		total: rows.length,
		detail: `Betriebe bewertet: ${completed} / ${rows.length}, übersprungen: ${skipped}, fehlgeschlagen: ${failed}`,
		skipped,
		failed
	});
	await writer.flush(true);
}

/** Start a refresh in the background. Returns the run id, or null if one is active. */
export async function startRefresh(): Promise<number | null> {
	if (activeRun || starting) return null;
	starting = true;
	const progress = createProgress();
	const controller = new AbortController();
	try {
		const [run] = await db
			.insert(scrapeRun)
			.values({ status: 'running', phase: 'starting', progress })
			.returning({ id: scrapeRun.id });

		activeRun = { runId: run.id, controller, startedAt: new Date() };
		runRefresh(run.id, controller.signal, progress).finally(() => {
			if (activeRun?.runId === run.id) activeRun = null;
		});
		return run.id;
	} catch (err) {
		activeRun = null;
		throw err;
	} finally {
		starting = false;
	}
}

export async function cancelRefresh(runId: number): Promise<{ active: boolean }> {
	const [current] = await db.select().from(scrapeRun).where(eq(scrapeRun.id, runId)).limit(1);
	const progress =
		current?.progress?.version === 1 ? current.progress : createProgress('Abbruch angefordert');
	progress.headline = 'Abbruch angefordert';
	progress.detail = 'Der Lauf wird abgebrochen.';
	await db
		.update(scrapeRun)
		.set({
			status: 'canceling',
			cancelRequestedAt: new Date(),
			phase: 'Abbruch angefordert',
			progress
		})
		.where(
			and(
				eq(scrapeRun.id, runId),
				or(eq(scrapeRun.status, 'running'), eq(scrapeRun.status, 'canceling'))
			)
		);

	if (activeRun?.runId !== runId) return { active: false };
	activeRun.controller.abort(new DOMException('Aktualisierung abgebrochen.', 'AbortError'));
	return { active: true };
}

export async function markInterruptedRun(runId: number): Promise<void> {
	const progress = createProgress('Aktualisierung fehlgeschlagen');
	progress.detail = 'Server-Neustart hat den Lauf unterbrochen.';
	for (const id of Object.keys(progress.phases) as RunPhaseId[]) {
		progress.phases[id].state = 'error';
	}
	await db
		.update(scrapeRun)
		.set({
			status: 'error',
			phase: 'Fehler',
			finishedAt: new Date(),
			progress,
			error: 'Server-Neustart hat den Lauf unterbrochen.'
		})
		.where(eq(scrapeRun.id, runId));
}
