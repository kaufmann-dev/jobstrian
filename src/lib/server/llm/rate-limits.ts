import type { LlmApiType } from '#lib/llm.js';
import { parseRetryAfter } from '../util/retry';

export interface RateLimitHints {
	retryAfterMs?: number;
	requestLimit?: number;
	exhaustedUntil?: number;
}

function numberHeader(headers: Headers, key: string): number | undefined {
	const raw = headers.get(key);
	if (!raw?.trim()) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function resetDuration(value: string | null): number | undefined {
	if (!value || !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/.test(value)) return undefined;
	const units: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
	return [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)].reduce(
		(sum, match) => sum + Number(match[1]) * units[match[2]],
		0
	);
}

export function rateLimitHints(
	headers: Headers,
	apiType: LlmApiType,
	now = Date.now()
): RateLimitHints {
	const anthropic = apiType === 'anthropic';
	const prefix = anthropic ? 'anthropic-ratelimit' : 'x-ratelimit';
	const requestLimit = numberHeader(
		headers,
		`${prefix}-${anthropic ? 'requests-limit' : 'limit-requests'}`
	);
	const buckets = anthropic
		? ['requests', 'tokens', 'input-tokens', 'output-tokens']
		: ['requests', 'tokens', 'project-tokens'];
	let exhaustedUntil: number | undefined;
	for (const bucket of buckets) {
		const remaining = numberHeader(
			headers,
			`${prefix}-${anthropic ? `${bucket}-remaining` : `remaining-${bucket}`}`
		);
		if (remaining !== 0) continue;
		const reset = headers.get(`${prefix}-${anthropic ? `${bucket}-reset` : `reset-${bucket}`}`);
		const deadline = anthropic
			? reset
				? Date.parse(reset)
				: NaN
			: now + (resetDuration(reset) ?? NaN);
		if (Number.isFinite(deadline) && deadline > now)
			exhaustedUntil = Math.max(exhaustedUntil ?? 0, deadline);
	}
	return {
		retryAfterMs: parseRetryAfter(headers.get('retry-after'), now),
		requestLimit: requestLimit != null && requestLimit >= 1 ? Math.floor(requestLimit) : undefined,
		exhaustedUntil
	};
}

const ACCESS_CODES = new Set([
	'insufficient_quota',
	'credit_balance_exhausted',
	'organization_spend_limit_exceeded',
	'project_spend_limit_exceeded',
	'organization_usage_limit_exceeded',
	'enforced_spend_limit_reached'
]);

/** Only documented codes leave the provider boundary; never retain its raw error body. */
export function providerAccessBlocked(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false;
	const error = (body as { error?: unknown }).error;
	if (!error || typeof error !== 'object') return false;
	const value = error as { code?: unknown; type?: unknown; details?: { error_code?: unknown } };
	return [value.code, value.type, value.details?.error_code].some(
		(code) => typeof code === 'string' && ACCESS_CODES.has(code)
	);
}
