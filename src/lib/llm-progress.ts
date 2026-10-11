import type { RunLlmProgress } from '#lib/server/db/schema.js';

const pauseTime = new Intl.DateTimeFormat('de-AT', {
	timeZone: 'Europe/Vienna',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
});

export function formatLlmProgress(metrics: RunLlmProgress): string {
	const activity = `KI: ${metrics.inFlight} aktiv, ${metrics.queued} warten`;
	const limits = `aktuell ${metrics.effectiveRequestsPerMinute}/${metrics.requestsPerMinute} Anfragen/min, ${metrics.effectiveMaxConcurrent}/${metrics.maxConcurrent} parallel`;
	const state =
		metrics.cooldownUntil !== null
			? `KI pausiert bis ${pauseTime.format(metrics.cooldownUntil)}`
			: metrics.recovering
				? 'KI wird vorsichtig fortgesetzt'
				: '';
	return [activity, limits, state].filter(Boolean).join(' · ');
}
