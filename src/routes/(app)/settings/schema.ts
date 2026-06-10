import { z } from 'zod';

export const settingsSchema = z.object({
	profileText: z.string().max(5000).default(''),
	// Comma-separated lists, split on save.
	roleKeywords: z.string().max(1000).default(''),
	languages: z.string().max(500).default(''),
	germanLevel: z.string().max(20).default(''),
	experienceYears: z.number().int().min(0).max(60).nullable().default(null),
	educationStatus: z.string().max(500).default(''),
	workPermit: z.boolean().default(false),
	availability: z.string().max(500).default(''),
	rankingNotes: z.string().max(2000).default(''),
	homeAddress: z.string().max(500).default(''),
	radiusMeters: z.number().int().min(100).max(20000).default(2000),
	sourceHokify: z.boolean().default(true),
	sourceWillhaben: z.boolean().default(true),
	sourceKarriere: z.boolean().default(true),
	sourceAms: z.boolean().default(true),
	llmBaseUrl: z.string().max(500).default(''),
	llmModel: z.string().max(200).default(''),
	// Left blank on load; only overwrites the stored key when non-empty.
	llmApiKey: z.string().max(500).default('')
});

export type SettingsSchema = typeof settingsSchema;
