import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
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
import { getSettings, updateSettings } from '../settings';
import { geocode } from '../geo/nominatim';
import { syncLeads } from '../geo/leads';
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
import { mapLimit } from '../util/concurrency';
import { closeBrowser } from './browser';
import { getEnabledAdapters, BROWSER_ADAPTERS } from './registry';
import type { ProfileQuery, RawListing } from './types';
import { DEFAULT_JOB_SEARCH_KEYWORDS } from '$lib/search-config';

const PROGRESS_FLUSH_INTERVAL_MS = 1000;

type Counts = { added: number; closed: number; ranked: number; leads: number };
type ActiveRun = { runId: number; controller: AbortController; startedAt: Date };

let activeRun: ActiveRun | null = null;

export function isRunning(): boolean {
	return activeRun !== null;
}

export function hasActiveRun(runId?: number): boolean {
	return activeRun !== null && (runId == null || activeRun.runId === runId);
}

function emptyPhase(): RunPhaseProgress {
	return { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 };
}

function createProgress(headline = 'Aktualisierung startet'): RunProgress {
	return {
		version: 1,
		headline,
		detail: '',
		phases: {
			setup: emptyPhase(),
			scrape: emptyPhase(),
			reconcile: emptyPhase(),
			leads: emptyPhase(),
			'rank-listings': emptyPhase(),
			'rank-leads': emptyPhase(),
			finalize: emptyPhase()
		},
		llm: {
			requestsPerMinute: 300,
			maxConcurrent: 50,
			queued: 0,
			inFlight: 0,
			completed: 0,
			failed: 0,
			skipped: 0,
			lastMinuteStarted: 0
		}
	};
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
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
				status: 'active',
				lastSeenRunId: runId,
				contentHash
			}
		})
		.returning({ inserted: sql<boolean>`(xmax = 0)` });
	return res[0]?.inserted === true;
}

async function ensureHomeCoords(settings: Settings, signal: AbortSignal): Promise<Settings> {
	if (settings.homeLat != null && settings.homeLon != null) return settings;
	if (!settings.homeAddress) return settings;
	throwIfAborted(signal);
	const point = await geocode(settings.homeAddress);
	throwIfAborted(signal);
	if (!point) return settings;
	return updateSettings({ homeLat: point.lat, homeLon: point.lon });
}

function cityFromAddress(address: string): string | null {
	const cleaned = address.trim();
	if (!cleaned) return null;
	const lastPart = cleaned
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.at(-1);
	if (!lastPart) return null;
	const city = lastPart
		.replace(/\b\d{4}\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return city || null;
}

function jobSearchLocations(settings: Settings): string[] {
	if (settings.jobSearchLocations.length) return settings.jobSearchLocations;
	const city = cityFromAddress(settings.homeAddress);
	return city ? [city] : [];
}

/** Flag leads whose business name matches an active listing's company. */
async function markLeadsWithPostings(): Promise<void> {
	await db.execute(sql`
		update ${lead} l set has_active_posting = exists (
			select 1 from ${listing} j
			where j.status = 'active' and length(trim(j.company)) > 0
			and (lower(j.company) like '%' || lower(l.name) || '%'
			     or lower(l.name) like '%' || lower(j.company) || '%')
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

	try {
		let settings = await getSettings();
		const limiter = new LlmLimiter({
			requestsPerMinute: settings.llmRequestsPerMinute,
			maxConcurrent: settings.llmMaxConcurrent
		});
		writer.setLimiter(limiter);
		const profile: ProfileQuery = {
			keywords: settings.jobSearchKeywords.length
				? settings.jobSearchKeywords
				: DEFAULT_JOB_SEARCH_KEYWORDS,
			locations: jobSearchLocations(settings)
		};
		throwIfAborted(signal);

		writer.phase('setup', { state: 'done', current: 1, total: 1, detail: 'Einstellungen geladen' });
		await writer.flush(true);

		const adapters = getEnabledAdapters(settings.enabledSources);
		writer.phase(
			'scrape',
			{
				state: adapters.length > 0 ? 'running' : 'skipped',
				current: 0,
				total: adapters.length,
				detail: adapters.length > 0 ? 'Quellen werden abgefragt' : 'Keine Quellen aktiviert'
			},
			'Stellen werden gesucht'
		);
		await writer.flush(true);

		for (const [index, adapter] of adapters.entries()) {
			throwIfAborted(signal);
			if (BROWSER_ADAPTERS.has(adapter.id)) usesBrowser = true;
			const detail = `${adapter.label}: ${index + 1} / ${adapters.length} Quellen`;
			writer.phase('scrape', { state: 'running', current: index, total: adapters.length, detail });
			await writer.flush(true);

			const listings = await adapter.search(profile, signal);
			for (const raw of listings) {
				throwIfAborted(signal);
				if (await upsertListing(adapter.id, raw, runId)) counts.added++;
			}
			writer.phase('scrape', { current: index + 1, detail });
			await writer.flush(true);
		}
		if (adapters.length > 0) {
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
		if (adapters.length > 0) {
			const enabledIds = adapters.map((a) => a.id);
			const closed = await db
				.update(listing)
				.set({ status: 'closed' })
				.where(
					and(
						eq(listing.status, 'active'),
						or(isNull(listing.lastSeenRunId), ne(listing.lastSeenRunId, runId)),
						inArray(listing.source, enabledIds)
					)
				)
				.returning({ id: listing.id });
			counts.closed = closed.length;
		}
		writer.phase('reconcile', {
			state: 'done',
			current: 1,
			total: 1,
			detail: `${counts.closed} nicht mehr verfügbare Stellen erkannt`
		});
		await writer.flush(true);

		writer.phase(
			'leads',
			{ state: 'running', current: 0, total: 1, detail: 'Betriebe in der Nähe werden gesucht' },
			'Betriebe werden gesucht'
		);
		await writer.flush(true);
		settings = await ensureHomeCoords(settings, signal);
		if (settings.homeLat != null && settings.homeLon != null) {
			try {
				const leadResult = await syncLeads(settings, runId, signal);
				counts.leads = leadResult.total;
				await markLeadsWithPostings();
				writer.phase('leads', {
					state: 'done',
					current: 1,
					total: 1,
					detail: `${leadResult.total} Betriebe gefunden`
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

		console.error('[runner] run failed:', err);
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
	await rankListings(settings, cfg, limiter, rankContext, counts, writer, signal);
	await rankLeads(settings, cfg, limiter, rankContext, draftContext, writer, signal);
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
				console.error(`[runner] rank listing ${row.id} failed:`, err);
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
				console.error(`[runner] rank lead ${row.id} failed:`, err);
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
	if (activeRun) return null;
	const progress = createProgress();
	try {
		const [run] = await db
			.insert(scrapeRun)
			.values({ status: 'running', phase: 'starting', progress })
			.returning({ id: scrapeRun.id });

		const controller = new AbortController();
		activeRun = { runId: run.id, controller, startedAt: new Date() };
		runRefresh(run.id, controller.signal, progress).finally(() => {
			if (activeRun?.runId === run.id) activeRun = null;
		});
		return run.id;
	} catch (err) {
		activeRun = null;
		throw err;
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
	activeRun.controller.abort(new DOMException('Refresh run canceled.', 'AbortError'));
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
