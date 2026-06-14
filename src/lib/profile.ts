import { z } from 'zod';

const shortText = z.string().max(500);
const description = z.string().max(3000);
const dateText = z.string().max(50);

export const workExperienceSchema = z.object({
	position: shortText,
	employer: shortText,
	location: shortText,
	startDate: dateText,
	endDate: dateText,
	description
});

export const educationHistorySchema = z.object({
	qualification: shortText,
	institution: shortText,
	field: shortText,
	location: shortText,
	startDate: dateText,
	endDate: dateText,
	description
});

export const certificationSchema = z.object({
	name: shortText,
	issuer: shortText,
	date: dateText,
	description
});

export const skillsSchema = z.array(z.string().max(200)).max(100);
export const workExperienceListSchema = z.array(workExperienceSchema).max(50);
export const educationHistoryListSchema = z.array(educationHistorySchema).max(50);
export const certificationsSchema = z.array(certificationSchema).max(50);

export const importableProfileFields = {
	fullName: z.string().max(200),
	phone: z.string().max(50),
	email: z.string().max(200),
	profileText: z.string().max(5000),
	languages: z.array(z.string().max(200)).max(50),
	germanLevel: z.string().max(20),
	experienceYears: z.number().int().min(0).max(60).nullable(),
	educationStatus: z.string().max(500),
	availability: z.string().max(500),
	homeAddress: z.string().max(500),
	skills: skillsSchema,
	workExperience: workExperienceListSchema,
	educationHistory: educationHistoryListSchema,
	certifications: certificationsSchema
} as const;

export const profilePreviewSchema = z.object(importableProfileFields).partial();
export type ProfilePreview = z.infer<typeof profilePreviewSchema>;
export type ProfileField = keyof ProfilePreview;
export type WorkExperience = z.infer<typeof workExperienceSchema>;
export type EducationHistory = z.infer<typeof educationHistorySchema>;
export type Certification = z.infer<typeof certificationSchema>;

const profileFieldSchema = z.enum(
	Object.keys(importableProfileFields) as [ProfileField, ...ProfileField[]]
);

export const profilePatchSchema = z
	.object({
		selected: z.array(profileFieldSchema).max(Object.keys(importableProfileFields).length),
		profile: profilePreviewSchema
	})
	.superRefine(({ selected, profile }, ctx) => {
		if (new Set(selected).size !== selected.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['selected'],
				message: 'Ausgewählte Felder dürfen nicht doppelt vorkommen.'
			});
		}
		for (const field of selected) {
			if (profile[field] === undefined) {
				ctx.addIssue({
					code: 'custom',
					path: ['selected'],
					message: `Ausgewähltes Feld fehlt: ${field}`
				});
			}
		}
	});

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
