import { verdictFromScore, type RankingVerdict } from './ranking-criteria';

const VERDICT_CLASS: Record<RankingVerdict, string> = {
	strong:
		'border-transparent bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
	maybe:
		'border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
	weak: 'border-transparent bg-muted text-muted-foreground'
};

/** Tailwind classes for a rank-score badge, colored by the verdict derived from the score. */
export function rankScoreClass(score: number): string {
	return VERDICT_CLASS[verdictFromScore(score)];
}
