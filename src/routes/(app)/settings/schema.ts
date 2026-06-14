import { z } from 'zod';
import {
	certificationsSchema,
	educationHistoryListSchema,
	skillsSchema,
	workExperienceListSchema
} from '$lib/profile';
import { businessOsmTagsSchema, stringListSchema } from '$lib/search-config';

export const settingsSchema = z.object({
	fullName: z.string().max(200).default(''),
	phone: z.string().max(50).default(''),
	email: z.string().max(200).default(''),
	profileText: z.string().max(5000).default(''),
	languages: z.array(z.string().max(200)).max(50).default([]),
	skills: skillsSchema.default([]),
	workExperience: workExperienceListSchema.default([]),
	educationHistory: educationHistoryListSchema.default([]),
	certifications: certificationsSchema.default([]),
	germanLevel: z.string().max(20).default(''),
	experienceYears: z.number().int().min(0).max(60).nullable().default(null),
	educationStatus: z.string().max(500).default(''),
	availability: z.string().max(500).default(''),
	rankingNotes: z.string().max(2000).default(''),
	homeAddress: z.string().max(500).default(''),
	jobSearchKeywords: stringListSchema.default([]),
	jobSearchLocations: stringListSchema.default([]),
	businessOsmTags: businessOsmTagsSchema.default([]),
	businessRadiusMeters: z.number().int().min(250).max(20000).default(5000),
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

export const apiKeySchema = settingsSchema.pick({ llmApiKey: true });

export type SettingsSchema = typeof settingsSchema;
