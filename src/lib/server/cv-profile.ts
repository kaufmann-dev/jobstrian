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
import { chatJson, getLlmConfig } from './llm/client';
import { LlmLimiter } from './llm/limiter';
import { getSettings, updateSettings } from './settings';

const MAX_PDF_TEXT_LENGTH = 100_000;

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
profileText, roleKeywords, languages, germanLevel, experienceYears, educationStatus, workPermit,
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
	const raw = await chatJson<unknown>(
		cfg,
		[
			{ role: 'system', content: EXTRACTION_SYSTEM },
			{ role: 'user', content: `LEBENSLAUF:\n${text}` }
		],
		{ limiter, temperature: 0 }
	);
	const parsed = profilePreviewSchema.safeParse(raw);
	if (!parsed.success) {
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
