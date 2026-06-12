import { getSettings } from '../settings';
import { llmLimiter } from './limiter';

export interface LlmConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export class LlmNotConfiguredError extends Error {
	constructor() {
		super('LLM is not configured (base URL / model missing in settings).');
		this.name = 'LlmNotConfiguredError';
	}
}

export async function getLlmConfig(): Promise<LlmConfig> {
	const s = await getSettings();
	if (!s.llmBaseUrl || !s.llmModel) throw new LlmNotConfiguredError();
	return { baseUrl: s.llmBaseUrl, apiKey: s.llmApiKey, model: s.llmModel };
}

function endpoint(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

/** Strip ```json fences some models wrap around their output. */
function unfence(text: string): string {
	const trimmed = text.trim();
	const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return (fence ? fence[1] : trimmed).trim();
}

/**
 * Call an OpenAI-compatible chat-completions endpoint and parse the assistant
 * message as JSON (response_format json_object). Throws on transport/parse error.
 */
export async function chatJson<T>(
	cfg: LlmConfig,
	messages: { role: 'system' | 'user'; content: string }[],
	opts: { temperature?: number; signal?: AbortSignal } = {}
): Promise<T> {
	const res = await llmLimiter.run(
		(signal) =>
			fetch(endpoint(cfg.baseUrl), {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {})
				},
				body: JSON.stringify({
					model: cfg.model,
					temperature: opts.temperature ?? 0.2,
					response_format: { type: 'json_object' },
					messages
				}),
				signal
			}),
		opts.signal
	);

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) throw new Error('LLM returned no content');

	try {
		return JSON.parse(unfence(content)) as T;
	} catch {
		throw new Error(`LLM returned non-JSON content: ${content.slice(0, 300)}`);
	}
}
