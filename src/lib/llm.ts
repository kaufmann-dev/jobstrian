export const LLM_API_TYPES = ['openai', 'anthropic', 'openai-compatible'] as const;
export type LlmApiType = (typeof LLM_API_TYPES)[number];

export const LLM_API_LABELS: Record<LlmApiType, string> = {
	openai: 'OpenAI (Responses API)',
	anthropic: 'Anthropic / Claude (Messages API)',
	'openai-compatible': 'OpenAI-kompatibel (Chat Completions)'
};

export const LLM_BASE_URLS: Record<LlmApiType, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	'openai-compatible': ''
};
