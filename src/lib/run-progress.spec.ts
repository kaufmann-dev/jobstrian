import { describe, expect, it } from 'vitest';
import {
	createRunProgress,
	normalizeRunProgress,
	RUN_PHASE_IDS,
	RUN_PHASE_LABELS
} from './run-progress';
import type { RunProgress, ScrapeRun } from './server/db/schema';

function runWithProgress(
	progress: Partial<RunProgress>
): Pick<ScrapeRun, 'status' | 'phase' | 'progress' | 'error'> {
	return {
		status: 'running',
		phase: progress.headline ?? 'running',
		progress: progress as RunProgress,
		error: null
	};
}

describe('run progress', () => {
	it('includes the email quality phase between leads and ranking', () => {
		const progress = createRunProgress();

		expect(RUN_PHASE_IDS).toEqual([
			'setup',
			'scrape',
			'reconcile',
			'enrich',
			'leads',
			'email-quality',
			'rank-listings',
			'rank-leads',
			'finalize'
		]);
		expect(RUN_PHASE_LABELS['email-quality']).toBe('E-Mail-Prüfung');
		expect(progress.phases['email-quality']).toMatchObject({
			state: 'pending',
			current: 0,
			total: 0
		});
	});

	it('normalizes stored progress that does not have the email quality phase yet', () => {
		const oldProgress = createRunProgress();
		delete (oldProgress.phases as Partial<RunProgress['phases']>)['email-quality'];

		const normalized = normalizeRunProgress(runWithProgress(oldProgress));

		expect(normalized.phases['email-quality']).toMatchObject({
			state: 'pending',
			current: 0,
			total: 0,
			skipped: 0,
			failed: 0
		});
	});

	it('preserves email quality counts for the collapsed and expanded progress UI', () => {
		const progress = createRunProgress('E-Mail-Adressen werden geprüft');
		progress.phases['email-quality'] = {
			state: 'running',
			current: 37,
			total: 100,
			detail: 'E-Mail-Adressen geprüft: 25 / 100, übersprungen: 12, akzeptiert: 24, abgelehnt: 1',
			skipped: 12,
			failed: 0
		};

		const normalized = normalizeRunProgress(runWithProgress(progress));

		expect(normalized.phases['email-quality']).toEqual(progress.phases['email-quality']);
	});
});
