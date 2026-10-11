import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() } }));
vi.mock('../db', () => ({ db }));

import {
	createConnection,
	discoverModels,
	getLlmConfig,
	getLlmLimiter,
	parseModelList,
	updateConnection,
	verifyLlmModel
} from './connections';
import type { LlmConfig } from './client';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('model discovery', () => {
	it('uses native Claude headers and follows pagination', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ data: [{ id: 'b' }], has_more: true, last_id: 'b' }))
			.mockResolvedValueOnce(Response.json({ data: [{ id: 'a' }, { id: 'b' }], has_more: false }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			discoverModels({
				apiType: 'anthropic',
				baseUrl: 'https://api.anthropic.com/v1/',
				apiKey: 'key'
			})
		).resolves.toEqual(['a', 'b']);
		expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
			'x-api-key': 'key',
			'anthropic-version': '2023-06-01'
		});
		expect(fetchMock.mock.calls[1][0].searchParams.get('after_id')).toBe('b');
	});
	it.each(['openai', 'openai-compatible'] as const)(
		'loads %s models with Bearer authentication',
		async (apiType) => {
			const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'm' }] }));
			vi.stubGlobal('fetch', fetchMock);
			await expect(
				discoverModels({ apiType, baseUrl: 'https://llm.test/v1', apiKey: 'key' })
			).resolves.toEqual(['m']);
			expect(fetchMock.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer key' });
		}
	);
	it('rejects a looping Claude cursor and explains manual entry on discovery errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve(Response.json({ data: [{ id: 'a' }], has_more: true, last_id: 'a' }))
				)
		);
		await expect(
			discoverModels({ apiType: 'anthropic', baseUrl: 'https://llm.test/v1', apiKey: '' })
		).rejects.toThrow('nächste Seite');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
		await expect(
			discoverModels({ apiType: 'openai', baseUrl: 'https://llm.test/v1', apiKey: '' })
		).rejects.toThrow('manuell');
	});
});

describe('saved connections and verification', () => {
	const connection = {
		id: 91,
		name: 'AI',
		apiType: 'openai' as const,
		baseUrl: 'https://llm.test/v1',
		apiKey: 'stored-key',
		requestsPerMinute: 60,
		maxConcurrent: 4
	};
	function query(rows: unknown[]) {
		return {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			innerJoin: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue(rows)
		};
	}
	let writes: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		db.select.mockReset();
		db.update.mockReset();
		db.insert.mockReset();
		writes = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([connection]) }),
			returning: vi.fn().mockResolvedValue([connection])
		});
		db.update.mockReturnValue({ set: writes });
		db.insert.mockReturnValue({ values: writes });
	});
	it('persists the selected API type', async () => {
		await createConnection({ ...connection, apiType: 'anthropic' });
		expect(writes).toHaveBeenCalledWith(expect.objectContaining({ apiType: 'anthropic' }));
	});
	it('clears model verification when only API type changes and retains an omitted key', async () => {
		db.select.mockReturnValue(query([connection]));
		await updateConnection(connection.id, { ...connection, apiType: 'anthropic', apiKey: '' });
		expect(writes).toHaveBeenCalledWith(
			expect.objectContaining({ apiType: 'anthropic', apiKey: 'stored-key' })
		);
		expect(writes).toHaveBeenCalledWith({ verified: false, verifiedAt: null });
	});
	it('resolves person selections and app defaults with provider and person identity', async () => {
		const joined = { connection, model: { id: 5, modelId: 'm', verified: true } };
		db.select.mockReturnValueOnce(query([joined]));
		await expect(getLlmConfig({ id: 3, llmModelId: 5 })).resolves.toMatchObject({
			apiType: 'openai',
			personId: 3,
			connectionId: 91,
			model: 'm'
		});
		db.select
			.mockReturnValueOnce(query([{ defaultLlmModelId: 5 }]))
			.mockReturnValueOnce(query([joined]));
		await expect(getLlmConfig({ id: 7, llmModelId: null })).resolves.toMatchObject({
			apiType: 'openai',
			personId: 7,
			model: 'm'
		});
	});
	it.each([true, false])('verifies only a valid native schema response (ok=%s)', async (ok) => {
		db.select.mockReturnValue(
			query([{ connection, model: { id: 5, modelId: 'm', verified: false } }])
		);
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				status: 'completed',
				output: [
					{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ok }) }] }
				]
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		if (ok) {
			await verifyLlmModel(5);
			expect(writes).toHaveBeenCalledWith({ verified: true, verifiedAt: expect.any(Date) });
		} else {
			await expect(verifyLlmModel(5)).rejects.toThrow('Schema');
			expect(writes).toHaveBeenCalledWith({ verified: false, verifiedAt: null });
		}
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_output_tokens).toBe(1024);
	});
});

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
		apiType: 'openai-compatible',
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
