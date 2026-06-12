import { describe, expect, it } from 'vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { settingsSchema } from './schema';

describe('settingsSchema', () => {
	it('defaults omitted portal checkbox fields to disabled', async () => {
		expect.assertions(5);

		const form = await superValidate(new FormData(), zod4(settingsSchema));

		expect(form.valid).toBe(true);
		expect(form.data.sourceHokify).toBe(false);
		expect(form.data.sourceWillhaben).toBe(false);
		expect(form.data.sourceKarriere).toBe(false);
		expect(form.data.sourceAms).toBe(false);
	});

	it('validates configurable LLM limits', async () => {
		const data = new FormData();
		data.set('llmRequestsPerMinute', '0');
		data.set('llmMaxConcurrent', '201');
		const form = await superValidate(data, zod4(settingsSchema));

		expect(form.valid).toBe(false);
		expect(form.errors.llmRequestsPerMinute).toBeDefined();
		expect(form.errors.llmMaxConcurrent).toBeDefined();
	});
});
