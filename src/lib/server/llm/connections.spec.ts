import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import { getLlmLimiter, parseModelList } from './connections';
import type { LlmConfig } from './client';

describe('parseModelList', () => {
	it('reads the OpenAI shape and sorts unique ids', () => {
		expect(parseModelList({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
	});

	it('accepts bare arrays, name fields and Google-style prefixes', () => {
		expect(parseModelList(['x', 'y'])).toEqual(['x', 'y']);
		expect(parseModelList({ models: [{ name: 'models/gemini-pro' }] })).toEqual(['gemini-pro']);
	});

	it('ignores unusable payloads', () => {
		expect(parseModelList(null)).toEqual([]);
		expect(parseModelList({ data: 'nope' })).toEqual([]);
		expect(parseModelList({ data: [{}, 3, ''] })).toEqual([]);
	});
});

describe('getLlmLimiter', () => {
	const config = (patch: Partial<LlmConfig> = {}): LlmConfig => ({
		connectionId: 1,
		modelRowId: 1,
		baseUrl: 'https://llm.test/v1',
		apiKey: '',
		model: 'm',
		requestsPerMinute: 60,
		maxConcurrent: 4,
		verified: true,
		...patch
	});

	it('shares one limiter per connection across models and people', () => {
		expect(getLlmLimiter(config())).toBe(getLlmLimiter(config({ modelRowId: 2, model: 'other' })));
	});

	it('uses separate limiters for separate connections and changed limits', () => {
		const base = getLlmLimiter(config());
		expect(getLlmLimiter(config({ connectionId: 2 }))).not.toBe(base);
		expect(getLlmLimiter(config({ requestsPerMinute: 120 }))).not.toBe(base);
	});
});
