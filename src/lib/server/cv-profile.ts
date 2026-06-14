import {
	FormatError,
	InvalidPDFException,
	PasswordException,
	PDFParse,
	UnknownErrorException
} from 'pdf-parse';
import {
	profilePatchSchema,
	profilePreviewSchema,
	type ProfilePatch,
	type ProfilePreview
} from '$lib/profile';
import type { Settings } from './db/schema';
import { getCvData } from './cv';
import { chatJson, getLlmConfig, LlmHttpError } from './llm/client';
import { LlmLimiter } from './llm/limiter';
import { getSettings, updateSettings } from './settings';

const MAX_PDF_TEXT_LENGTH = 100_000;
const STRING_FIELDS = [
	'profileText',
	'germanLevel',
	'educationStatus',
	'availability',
	'homeAddress'
] as const;
const STRING_LIST_FIELDS = ['languages', 'skills'] as const;
const WORK_FIELDS = [
	'position',
	'employer',
	'location',
	'startDate',
	'endDate',
	'description'
] as const;
const EDUCATION_FIELDS = [
	'qualification',
	'institution',
	'field',
	'location',
	'startDate',
	'endDate',
	'description'
] as const;
const CERTIFICATION_FIELDS = ['name', 'issuer', 'date', 'description'] as const;

export class CvProfileError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
		this.name = 'CvProfileError';
	}
}

export function isCvProfileError(error: unknown): error is CvProfileError {
	return (
		error instanceof CvProfileError ||
		(error instanceof Error &&
			error.name === 'CvProfileError' &&
			'status' in error &&
			typeof error.status === 'number')
	);
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function normalizedStrings(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return [
		...new Set(
			value
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.trim())
				.filter(Boolean)
		)
	];
}

function normalizedEntries<const Fields extends readonly string[]>(
	value: unknown,
	fields: Fields
): Record<Fields[number], string>[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.flatMap((item) => {
		const source = record(item);
		if (!source) return [];
		const entry = Object.fromEntries(
			fields.map((field) => [field, typeof source[field] === 'string' ? source[field].trim() : ''])
		) as Record<Fields[number], string>;
		return Object.values(entry).some(Boolean) ? [entry] : [];
	});
}

/**
 * Normalize conservative variations commonly returned by JSON-capable models:
 * null means "not found", and omitted nested properties become empty strings.
 */
export function normalizeProfilePreview(raw: unknown): unknown {
	const outer = record(raw);
	if (!outer) return raw;
	const source = record(outer.profile) ?? outer;
	const normalized: Record<string, unknown> = {};

	for (const field of STRING_FIELDS) {
		if (typeof source[field] === 'string' && source[field].trim()) {
			normalized[field] = source[field].trim();
		}
	}
	for (const field of STRING_LIST_FIELDS) {
		const value = normalizedStrings(source[field]);
		if (value?.length) normalized[field] = value;
	}
	if (typeof source.experienceYears === 'number') {
		normalized.experienceYears = source.experienceYears;
	} else if (
		typeof source.experienceYears === 'string' &&
		/^\d+$/.test(source.experienceYears.trim())
	) {
		normalized.experienceYears = Number(source.experienceYears);
	}
	const workExperience = normalizedEntries(source.workExperience, WORK_FIELDS);
	if (workExperience?.length) normalized.workExperience = workExperience;
	const educationHistory = normalizedEntries(source.educationHistory, EDUCATION_FIELDS);
	if (educationHistory?.length) normalized.educationHistory = educationHistory;
	const certifications = normalizedEntries(source.certifications, CERTIFICATION_FIELDS);
	if (certifications?.length) normalized.certifications = certifications;

	return normalized;
}

export async function extractPdfText(data: Buffer): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(data) });
	try {
		const result = await parser.getText();
		const text = result.text.trim();
		if (!text) {
			throw new CvProfileError(
				'Der Lebenslauf enthält keinen lesbaren Text. Bild-Scans werden nicht unterstützt.'
			);
		}
		if (text.length > MAX_PDF_TEXT_LENGTH) {
			throw new CvProfileError('Der Lebenslauf enthält zu viel Text für den KI-Import.', 413);
		}
		return text;
	} catch (error) {
		if (error instanceof CvProfileError) throw error;
		if (error instanceof PasswordException) {
			throw new CvProfileError(
				'Verschlüsselte oder passwortgeschützte PDFs werden nicht unterstützt.'
			);
		}
		if (
			error instanceof InvalidPDFException ||
			error instanceof FormatError ||
			error instanceof UnknownErrorException
		) {
			throw new CvProfileError('Die gespeicherte Datei ist kein gültiges PDF.');
		}
		throw error;
	} finally {
		await parser.destroy();
	}
}

const EXTRACTION_SYSTEM = `Du extrahierst ein bewerbungsrelevantes Profil aus einem Lebenslauf.
Antworte ausschließlich mit einem JSON-Objekt. Erlaubte Felder:
profileText, languages, germanLevel, experienceYears, educationStatus,
availability, homeAddress, skills, workExperience, educationHistory, certifications.

Regeln:
- Gib nur Felder zurück, die im Lebenslauf ausdrücklich genannt oder direkt daraus ableitbar sind.
- Erfinde und rate nichts. Lasse nicht belegte Felder vollständig weg.
- Fasse profileText knapp und sachlich zusammen.
- Normalisiere Listen, entferne Dubletten und lasse leere Einträge weg.
- experienceYears ist eine ganze Zahl oder null.
- workExperience-Einträge haben position, employer, location, startDate, endDate, description.
- educationHistory-Einträge haben qualification, institution, field, location, startDate, endDate, description.
- certifications-Einträge haben name, issuer, date, description.
- Verwende für fehlende Eigenschaften innerhalb eines gefundenen Listeneintrags einen leeren String.
- Kontaktdaten, Geburtsdatum, Nationalität und andere sensible persönliche Daten gehören nicht ins Profil.`;

export async function createProfilePreview(): Promise<ProfilePreview> {
	const [storedCv, settings] = await Promise.all([getCvData(), getSettings()]);
	if (!storedCv) throw new CvProfileError('Kein Lebenslauf hinterlegt.', 404);
	if (storedCv.mimeType !== 'application/pdf') {
		throw new CvProfileError('Der gespeicherte Lebenslauf ist keine PDF-Datei.', 415);
	}

	const cfg = await getLlmConfig(settings).catch(() => {
		throw new CvProfileError('Die KI-Konfiguration ist unvollständig.', 409);
	});
	const text = await extractPdfText(storedCv.data);
	const limiter = new LlmLimiter({
		requestsPerMinute: settings.llmRequestsPerMinute,
		maxConcurrent: settings.llmMaxConcurrent
	});
	let raw: unknown;
	try {
		raw = await chatJson<unknown>(
			cfg,
			[
				{ role: 'system', content: EXTRACTION_SYSTEM },
				{ role: 'user', content: `LEBENSLAUF:\n${text}` }
			],
			{ limiter, temperature: 0 }
		);
	} catch (error) {
		if (error instanceof LlmHttpError && (error.status === 401 || error.status === 403)) {
			throw new CvProfileError(
				'KI-Anmeldung fehlgeschlagen. Prüfe den gespeicherten API-Key.',
				502
			);
		}
		throw error;
	}
	const parsed = profilePreviewSchema.safeParse(normalizeProfilePreview(raw));
	if (!parsed.success) {
		console.error('Invalid LLM CV profile response', parsed.error.issues);
		throw new CvProfileError('Die KI-Antwort enthält kein gültiges Profil.', 502);
	}
	if (Object.keys(parsed.data).length === 0) {
		throw new CvProfileError('Im Lebenslauf wurden keine unterstützten Profildaten gefunden.', 422);
	}
	return parsed.data;
}

export function selectedProfilePatch(current: Settings, input: ProfilePatch): Partial<Settings> {
	const patch: Partial<Settings> = {};
	for (const field of input.selected) {
		const value = input.profile[field];
		if (value !== undefined) Object.assign(patch, { [field]: value });
	}
	if (
		input.selected.includes('homeAddress') &&
		input.profile.homeAddress?.trim() !== current.homeAddress.trim()
	) {
		patch.homeLat = null;
		patch.homeLon = null;
	}
	return patch;
}

export async function applyProfilePatch(input: unknown): Promise<Settings> {
	const parsed = profilePatchSchema.safeParse(input);
	if (!parsed.success) throw new CvProfileError('Die ausgewählten Profildaten sind ungültig.');
	const current = await getSettings();
	return updateSettings(selectedProfilePatch(current, parsed.data));
}
