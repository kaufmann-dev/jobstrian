import { z } from 'zod';
import {
	certificationsSchema,
	educationHistoryListSchema,
	skillsSchema,
	workExperienceListSchema
} from '$lib/profile';

export const settingsSchema = z.object({
	profileText: z.string().max(5000).default(''),
	roleKeywords: z.array(z.string().max(200)).max(100).default([]),
	languages: z.array(z.string().max(200)).max(50).default([]),
	skills: skillsSchema.default([]),
	workExperience: workExperienceListSchema.default([]),
	educationHistory: educationHistoryListSchema.default([]),
	certifications: certificationsSchema.default([]),
	germanLevel: z.string().max(20).default(''),
	experienceYears: z.number().int().min(0).max(60).nullable().default(null),
	educationStatus: z.string().max(500).default(''),
	workPermit: z.boolean().default(false),
	availability: z.string().max(500).default(''),
	rankingNotes: z.string().max(2000).default(''),
	homeAddress: z.string().max(500).default(''),
	radiusMeters: z.number().int().min(100).max(20000).default(2000),
	sourceHokify: z.boolean().default(false),
	sourceWillhaben: z.boolean().default(false),
	sourceKarriere: z.boolean().default(false),
	sourceAms: z.boolean().default(false),
	llmBaseUrl: z.string().max(500).default(''),
	llmModel: z.string().max(200).default(''),
	llmRequestsPerMinute: z.number().int().min(1).max(10000).default(300),
	llmMaxConcurrent: z.number().int().min(1).max(200).default(50),
	// Left blank on load; only overwrites the stored key when non-empty.
	llmApiKey: z.string().max(500).default('')
});

export type SettingsSchema = typeof settingsSchema;
