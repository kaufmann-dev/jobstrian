import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { listing, lead, scrapeRun, type Settings } from '../db/schema';
import { getSettings, updateSettings } from '../settings';
import { geocode } from '../geo/nominatim';
import { syncLeads } from '../geo/leads';
import { getLlmConfig, LlmNotConfiguredError } from '../llm/client';
import { rankListing, rankLead } from '../llm/rank';
import { draftColdEmail } from '../llm/draft-email';
import { mapLimit } from '../util/concurrency';
import { closeBrowser } from './browser';
import { getEnabledAdapters, BROWSER_ADAPTERS } from './registry';
import type { ProfileQuery, RawListing } from './types';

let running = false;

export function isRunning(): boolean {
	return running;
}

type Counts = { added: number; closed: number; ranked: number; leads: number };

async function setProgress(runId: number, phase: string, counts: Counts): Promise<void> {
	await db.update(scrapeRun).set({ phase, counts }).where(eq(scrapeRun.id, runId));
}

/** Upsert a scraped listing; returns true if newly inserted. */
async function upsertListing(source: string, r: RawListing, runId: number): Promise<boolean> {
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
			lastSeenRunId: runId
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
				lastSeenRunId: runId
			}
		})
		.returning({ inserted: sql<boolean>`(xmax = 0)` });
	return res[0]?.inserted === true;
}

async function ensureHomeCoords(settings: Settings): Promise<Settings> {
	if (settings.homeLat != null && settings.homeLon != null) return settings;
	if (!settings.homeAddress) return settings;
	const point = await geocode(settings.homeAddress);
	if (!point) return settings;
	return updateSettings({ homeLat: point.lat, homeLon: point.lon });
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

export async function runRefresh(runId: number): Promise<void> {
	const counts: Counts = { added: 0, closed: 0, ranked: 0, leads: 0 };
	let usesBrowser = false;
	try {
		let settings = await getSettings();
		const profile: ProfileQuery = {
			keywords: settings.roleKeywords.length ? settings.roleKeywords : ['Barista', 'Kellner'],
			location: 'Wien'
		};

		// --- Scrape each enabled source ---
		const adapters = getEnabledAdapters(settings.enabledSources);
		for (const adapter of adapters) {
			if (BROWSER_ADAPTERS.has(adapter.id)) usesBrowser = true;
			await setProgress(runId, `Suche: ${adapter.label}`, counts);
			const listings = await adapter.search(profile);
			for (const raw of listings) {
				if (await upsertListing(adapter.id, raw, runId)) counts.added++;
			}
			await setProgress(runId, `Suche: ${adapter.label}`, counts);
		}

		// --- Close listings that vanished this run ---
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

		// --- Nearby businesses (leads) ---
		await setProgress(runId, 'Betriebe in der Nähe', counts);
		settings = await ensureHomeCoords(settings);
		if (settings.homeLat != null && settings.homeLon != null) {
			const leadResult = await syncLeads(settings, runId);
			counts.leads = leadResult.total;
			await markLeadsWithPostings();
			await setProgress(runId, 'Betriebe in der Nähe', counts);
		}

		// --- LLM ranking + cold-email drafts ---
		await rankAll(runId, settings, counts);

		await db
			.update(scrapeRun)
			.set({ status: 'done', phase: 'fertig', finishedAt: new Date(), counts })
			.where(eq(scrapeRun.id, runId));
	} catch (err) {
		console.error('[runner] run failed:', err);
		await db
			.update(scrapeRun)
			.set({
				status: 'error',
				phase: 'Fehler',
				finishedAt: new Date(),
				counts,
				error: err instanceof Error ? err.message : String(err)
			})
			.where(eq(scrapeRun.id, runId));
	} finally {
		if (usesBrowser) await closeBrowser();
	}
}

async function rankAll(runId: number, settings: Settings, counts: Counts): Promise<void> {
	let cfg;
	try {
		cfg = await getLlmConfig();
	} catch (err) {
		if (err instanceof LlmNotConfiguredError) {
			await setProgress(runId, 'LLM nicht konfiguriert — Ranking übersprungen', counts);
			return;
		}
		throw err;
	}

	await setProgress(runId, 'Bewertung der Stellen', counts);
	const unranked = await db
		.select()
		.from(listing)
		.where(and(eq(listing.status, 'active'), isNull(listing.rankScore)));
	await mapLimit(unranked, 3, async (row) => {
		try {
			const result = await rankListing(cfg, settings, row);
			await db
				.update(listing)
				.set({
					rankScore: result.score,
					rankVerdict: result.verdict,
					rankReason: result.reason,
					rankedAt: new Date()
				})
				.where(eq(listing.id, row.id));
			counts.ranked++;
		} catch (err) {
			console.error(`[runner] rank listing ${row.id} failed:`, err);
		}
	});
	await setProgress(runId, 'Bewertung der Stellen', counts);

	// Rank + draft for leads without an active posting that aren't ranked yet.
	await setProgress(runId, 'Bewertung der Betriebe', counts);
	const freshLeads = await db
		.select()
		.from(lead)
		.where(and(eq(lead.hasActivePosting, false), isNull(lead.rankScore)));
	await mapLimit(freshLeads, 3, async (row) => {
		try {
			const result = await rankLead(cfg, settings, row);
			const draft = row.email ? await draftColdEmail(cfg, settings, row) : null;
			await db
				.update(lead)
				.set({
					rankScore: result.score,
					rankReason: result.reason,
					draftSubject: draft?.subject,
					draftBody: draft?.body
				})
				.where(eq(lead.id, row.id));
		} catch (err) {
			console.error(`[runner] rank lead ${row.id} failed:`, err);
		}
	});
	await setProgress(runId, 'fertig', counts);
}

/** Start a refresh in the background. Returns the run id, or null if one is active. */
export async function startRefresh(): Promise<number | null> {
	if (running) return null;
	running = true;
	try {
		const [run] = await db
			.insert(scrapeRun)
			.values({ status: 'running', phase: 'starting' })
			.returning({ id: scrapeRun.id });
		// Fire and forget — UI polls scrape_run for progress.
		runRefresh(run.id).finally(() => {
			running = false;
		});
		return run.id;
	} catch (err) {
		running = false;
		throw err;
	}
}
