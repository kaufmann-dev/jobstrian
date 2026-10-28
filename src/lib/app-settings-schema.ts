import { z } from 'zod';
import { personColorSchema, personNameSchema } from '#lib/people.js';
import { LLM_API_TYPES, LLM_REASONING_EFFORTS } from '#lib/llm.js';

const id = z.number().int().positive();

/** Create (no id) or edit (id) a person. */
export const personFormSchema = z.object({
	id: id.optional(),
	name: personNameSchema,
	color: personColorSchema.default('amber')
});

export const idFormSchema = z.object({ id });

/** Set a saved model's reasoning level; an empty value means the provider default. */
export const modelReasoningFormSchema = z.object({
	id,
	reasoningEffort: z.enum(LLM_REASONING_EFFORTS).nullable()
});

/** Revoke a connected MCP/OAuth client. */
export const clientIdFormSchema = z.object({ clientId: z.string().min(1).max(500) });

/** Create (no id) or edit (id) an LLM connection. An empty API key keeps the stored one. */
export const connectionFormSchema = z.object({
	id: id.optional(),
	name: z.string().trim().min(1, 'Name fehlt.').max(80),
	apiType: z.enum(LLM_API_TYPES).default('openai'),
	baseUrl: z
		.string()
		.trim()
		.min(1, 'Base URL fehlt.')
		.max(500)
		.refine(
			(v) => /^https?:\/\//i.test(v),
			'Die Base URL muss mit http:// oder https:// beginnen.'
		),
	apiKey: z.string().max(500).default(''),
	requestsPerMinute: z.number().int().min(1).max(10000).default(300),
	maxConcurrent: z.number().int().min(1).max(200).default(50)
});

export const loadModelsFormSchema = z.object({ connectionId: id });

export const addModelsFormSchema = z.object({
	connectionId: id,
	modelIds: z
		.array(z.string().trim().min(1).max(200))
		.min(1, 'Wähle mindestens ein Modell.')
		.max(200)
});

export const appSettingsFormSchema = z.object({
	defaultLlmModelId: id.nullable().default(null),
	ghostAfterDays: z.number().int().min(1).max(365).default(21)
});
