import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Listing, ScrapeRun } from '../db/schema';

const state = vi.hoisted(() => ({
	rows: [] as Listing[],
	writes: [] as Partial<ScrapeRun>[],
	selects: 0,
	ki: false,
	limiter: null as import('../llm/limiter').LlmLimiter | null
}));

vi.mock('../db', async () => {
	const { listing, scrapeRun } = await import('../db/schema');
	return {
		db: {
			select: () => ({
				from: (table: unknown) => ({
					where: async () => {
						if (table !== listing) return [];
						state.selects++;
						return state.selects === 1 || (state.ki && state.selects === 2) ? [] : state.rows;
					}
				})
			}),
			update: (table: unknown) => ({
				set: (value: Partial<ScrapeRun>) => ({
					where: async () => {
						if (table === scrapeRun) state.writes.push(structuredClone(value));
					}
				})
			})
		}
	};
});
vi.mock('../people', () => ({
	getPerson: async () => ({
		id: 1,
		fullName: 'Applicant',
		enabledSources: ['hokify'],
		jobSearchKeywords: ['Office'],
		jobSearchLocations: ['Wien'],
		businessOsmTags: [],
		languages: [],
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		listingRankingCriteria: [{ id: 'match', label: 'Passung', weight: 1, description: '' }],
		leadRankingCriteria: []
	})
}));
vi.mock('../llm/connections', async () => {
	const { LlmNotConfiguredError } = await import('../llm/client');
	return {
		getLlmConfig: async () => {
			if (!state.ki) throw new LlmNotConfiguredError();
			return {
				apiType: 'openai-compatible',
				baseUrl: 'https://llm.test/v1',
				apiKey: '',
				model: 'test',
				connectionId: 1,
				modelRowId: 1,
				requestsPerMinute: 1000,
				maxConcurrent: 8
			};
		},
		getLlmLimiter: () => state.limiter
	};
});
vi.mock('./registry', async () => {
	const { fetchText } = await import('../util/http');
	const adapter = {
		id: 'hokify',
		label: 'Hokify',
		search: async () => ({ listings: [], complete: true, failureReasons: [] }),
		fetchDescription: (
			url: string,
			signal: AbortSignal,
			onRetry: import('../util/retry').RetryObserver
		) => fetchText(url, { signal, onRetry })
	};
	return {
		ADAPTERS: { hokify: adapter },
		getEnabledAdapters: () => [adapter],
		BROWSER_ADAPTERS: new Set()
	};
});

import { runRefresh } from './runner';
import { LlmLimiter } from '../llm/limiter';

describe('refresh retry outcomes and progress lifecycle', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		state.selects = 0;
		state.ki = false;
		state.limiter = new LlmLimiter({ requestsPerMinute: 1000, maxConcurrent: 8, random: () => 0 });
		state.writes = [];
		state.rows = [
			{ id: 1, source: 'hokify', url: 'https://jobs.test/1', title: 'Office' } as Listing
		];
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('clears recovered warnings and retry detail in the persisted final result', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response('busy', { status: 503, headers: { 'retry-after': '2' } }))
			.mockResolvedValue(new Response('Description'));
		vi.stubGlobal('fetch', fetch);
		const pending = runRefresh(1, 1, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(1000);
		const interim = state.writes.at(-1)!.progress!.phases.enrich;
		expect(interim).toMatchObject({ state: 'running', failed: 0, current: 0 });
		expect(interim.detail).toContain('erneuter Versuch 2');
		await vi.advanceTimersByTimeAsync(1000);
		await pending;
		expect(fetch).toHaveBeenCalledTimes(2);
		const final = state.writes.at(-1)!;
		expect(final.status).toBe('done');
		expect(final.progress!.phases.enrich).toMatchObject({
			state: 'done',
			failed: 0,
			current: 1,
			failureReasons: []
		});
		expect(final.progress!.phases.enrich.detail).not.toContain('erneuter Versuch');
		const count = state.writes.length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(state.writes).toHaveLength(count);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('reports one logical failure after three unsuccessful attempts', async () => {
		const fetch = vi.fn().mockImplementation(async () => new Response('busy', { status: 503 }));
		vi.stubGlobal('fetch', fetch);
		const pending = runRefresh(1, 1, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(2000);
		await pending;
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(state.writes.at(-1)!.progress!.phases.enrich).toMatchObject({
			state: 'warning',
			failed: 1,
			current: 1,
			failureReasons: [{ code: 'http-503', count: 1 }]
		});
	});

	it('persists cooldown heartbeats and clears warnings after repeated rate limits recover', async () => {
		state.ki = true;
		let calls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				if (++calls <= 4)
					return Response.json(
						{ error: { type: 'rate_limit_error' } },
						{
							status: 429,
							headers: { 'retry-after': '2' }
						}
					);
				return Response.json({
					choices: [
						{
							message: {
								content: JSON.stringify({
									criteria: [{ criterionId: 'match', score: 5, reason: 'Passend' }]
								})
							}
						}
					]
				});
			})
		);
		const pending = runRefresh(1, 1, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(1000);
		expect(state.writes.at(-1)!.progress!.llm).toMatchObject({
			effectiveRequestsPerMinute: 500,
			effectiveMaxConcurrent: 4,
			recovering: true,
			failed: 0,
			queued: 1
		});
		expect(state.writes.at(-1)!.progress!.llm.cooldownUntil).toBe(Date.now() + 1000);
		await vi.advanceTimersByTimeAsync(60_000);
		await pending;
		const final = state.writes.at(-1)!;
		expect(calls).toBe(5);
		expect(final.status).toBe('done');
		expect(final.progress!.phases['rank-listings']).toMatchObject({
			state: 'done',
			current: 1,
			failed: 0,
			failureReasons: []
		});
		expect(final.progress!.llm).toMatchObject({
			completed: 1,
			failed: 0,
			queued: 0,
			inFlight: 0,
			recovering: false,
			cooldownUntil: null
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it('cancels the shared rate-limit wait without late progress writes', async () => {
		state.ki = true;
		const fetch = vi.fn(async () =>
			Response.json(
				{ error: { type: 'rate_limit_error' } },
				{
					status: 429,
					headers: { 'retry-after': '60' }
				}
			)
		);
		vi.stubGlobal('fetch', fetch);
		const controller = new AbortController();
		const pending = runRefresh(1, 1, controller.signal);
		await vi.advanceTimersByTimeAsync(1000);
		expect(state.limiter!.metrics().queued).toBe(1);
		controller.abort(new DOMException('Canceled', 'AbortError'));
		await pending;
		expect(state.writes.at(-1)!.status).toBe('canceled');
		expect(state.writes.at(-1)!.progress!.llm).toMatchObject({ failed: 0, queued: 0, inFlight: 0 });
		const count = state.writes.length;
		await vi.advanceTimersByTimeAsync(120_000);
		expect(state.writes).toHaveLength(count);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('cancels a waiting retry and never overwrites its terminal state', async () => {
		const fetch = vi.fn().mockImplementation(
			async () =>
				new Response('busy', {
					status: 503,
					headers: { 'retry-after': '60' }
				})
		);
		vi.stubGlobal('fetch', fetch);
		const controller = new AbortController();
		const pending = runRefresh(1, 1, controller.signal);
		await vi.advanceTimersByTimeAsync(1000);
		controller.abort(new DOMException('Canceled', 'AbortError'));
		await pending;
		expect(state.writes.at(-1)!.status).toBe('canceled');
		expect(state.writes.at(-1)!.progress!.phases.enrich.detail).not.toContain('erneuter Versuch');
		const count = state.writes.length;
		await vi.advanceTimersByTimeAsync(120_000);
		expect(state.writes).toHaveLength(count);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
