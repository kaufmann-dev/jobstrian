import type { RunPhaseId, RunPhaseProgress, RunProgress, ScrapeRun } from '$lib/server/db/schema';

export const RUN_PHASE_IDS = [
	'setup',
	'scrape',
	'reconcile',
	'enrich',
	'leads',
	'email-quality',
	'rank-listings',
	'rank-leads',
	'finalize'
] as const satisfies readonly RunPhaseId[];

export const RUN_PHASE_LABELS: Record<RunPhaseId, string> = {
	setup: 'Vorbereitung',
	scrape: 'Quellen',
	reconcile: 'Abgleich',
	enrich: 'Beschreibungen',
	leads: 'Betriebe',
	'email-quality': 'E-Mail-Prüfung',
	'rank-listings': 'Stellenbewertung',
	'rank-leads': 'Betriebsbewertung',
	finalize: 'Abschluss'
};

export type RunProgressSource = Pick<ScrapeRun, 'status' | 'phase' | 'progress' | 'error'>;

export function emptyRunPhase(): RunPhaseProgress {
	return { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 };
}

export function createRunProgress(headline = 'Aktualisierung startet'): RunProgress {
	return {
		version: 1,
		headline,
		detail: '',
		phases: Object.fromEntries(RUN_PHASE_IDS.map((id) => [id, emptyRunPhase()])) as Record<
			RunPhaseId,
			RunPhaseProgress
		>,
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

export function fallbackRunProgress(currentRun: RunProgressSource | null): RunProgress {
	const progress = createRunProgress(currentRun?.phase ?? 'Noch kein Lauf');
	progress.detail = currentRun?.error ?? '';
	progress.phases.setup = {
		state: currentRun ? 'done' : 'pending',
		current: currentRun ? 1 : 0,
		total: 1,
		detail: '',
		skipped: 0,
		failed: 0
	};
	return progress;
}

export function normalizeRunProgress(currentRun: RunProgressSource | null): RunProgress {
	const fallback = fallbackRunProgress(currentRun);
	const stored = currentRun?.progress as Partial<RunProgress> | null | undefined;
	if (stored?.version !== 1) return fallback;
	const phases = Object.fromEntries(
		RUN_PHASE_IDS.map((id) => {
			const phase = { ...fallback.phases[id], ...stored.phases?.[id] };
			if (
				currentRun?.status === 'done' &&
				(phase.state === 'error' || (phase.state === 'done' && phase.failed > 0))
			) {
				phase.state = 'warning';
			}
			return [id, phase];
		})
	) as RunProgress['phases'];
	return {
		...fallback,
		...stored,
		headline: stored.headline ?? fallback.headline,
		detail: stored.detail ?? fallback.detail,
		phases,
		llm: { ...fallback.llm, ...stored.llm }
	};
}
