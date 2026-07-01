import type { Settings } from '../db/schema';
import { getSettings, updateSettings } from '../settings';
import { chatJson, getLlmConfig } from './client';
import { LlmLimiter } from './limiter';

export type LlmConfigStatus = {
	hasApiKey: boolean;
	hasConfig: boolean;
	verified: boolean;
	verifiedAt: Date | null;
};

export function llmConfigStatus(s: Settings): LlmConfigStatus {
	return {
		hasApiKey: Boolean(s.llmApiKey),
		hasConfig: Boolean(s.llmBaseUrl && s.llmModel),
		verified: s.llmVerified,
		verifiedAt: s.llmVerifiedAt
	};
}

/**
 * Send one real chat request to the configured OpenAI-compatible endpoint and
 * persist the outcome. On success the connection counts as verified; any failure
 * clears the verified status and rethrows so the caller can surface the reason.
 */
export async function verifyLlmConnection(): Promise<Settings> {
	const current = await getSettings();
	const cfg = await getLlmConfig(current);
	const limiter = new LlmLimiter({
		requestsPerMinute: current.llmRequestsPerMinute,
		maxConcurrent: current.llmMaxConcurrent
	});
	try {
		await chatJson<unknown>(
			cfg,
			[
				{ role: 'system', content: 'Antworte ausschließlich mit einem JSON-Objekt.' },
				{ role: 'user', content: 'Gib {"ok":true} als JSON zurück.' }
			],
			{ limiter, maxAttempts: 1, temperature: 0 }
		);
	} catch (err) {
		await updateSettings({ llmVerified: false, llmVerifiedAt: null });
		throw err;
	}
	return updateSettings({ llmVerified: true, llmVerifiedAt: new Date() });
}
