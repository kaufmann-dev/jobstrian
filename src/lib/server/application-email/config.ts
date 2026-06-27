import { Resend } from 'resend';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings, type ApplicationEmailDnsRecord, type Settings } from '../db/schema';
import { getSettings, updateSettings } from '../settings';
import { getCvMeta } from '../cv';

export type ApplicationEmailReadiness = {
	ready: boolean;
	reasons: string[];
};

export type ApplicationEmailDomainConfig = {
	hasResendApiKey: boolean;
	domain: string;
	domainId: string | null;
	status: string;
	records: ApplicationEmailDnsRecord[];
	verifiedAt: Date | null;
	enabled: boolean;
	fromAddress: string;
	replyTo: string;
	fromName: string;
	webhookConfigured: boolean;
};

type ResendDomainRecord = {
	record?: string;
	name?: string;
	type?: string;
	value?: string;
	ttl?: string | number;
	status?: string;
	priority?: number;
};

type ResendDomain = {
	id?: string;
	name?: string;
	status?: string;
	records?: ResendDomainRecord[];
};

const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

export function normalizeDomain(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/.*$/, '');
}

export function normalizeLocalPart(value: string): string {
	return value.trim().toLowerCase() || 'bewerbung';
}

export function applicationEmailFromAddress(s: Settings): string {
	const domain = normalizeDomain(s.resendDomain);
	const local = normalizeLocalPart(s.resendFromLocalPart);
	if (!domain) return '';
	const address = `${local}@${domain}`;
	const name = s.resendFromName.trim() || s.fullName.trim();
	return name ? `${name.replaceAll('"', '')} <${address}>` : address;
}

export function applicationEmailReplyTo(s: Settings): string {
	return s.resendReplyTo.trim() || s.email.trim();
}

export function applicationEmailDomainConfig(s: Settings): ApplicationEmailDomainConfig {
	return {
		hasResendApiKey: Boolean(s.resendApiKey),
		domain: s.resendDomain,
		domainId: s.resendDomainId,
		status: s.resendDomainStatus,
		records: s.resendDnsRecords,
		verifiedAt: s.resendDnsVerifiedAt,
		enabled: s.applicationEmailEnabled,
		fromAddress: applicationEmailFromAddress(s),
		replyTo: applicationEmailReplyTo(s),
		fromName: s.resendFromName,
		webhookConfigured: Boolean(s.resendWebhookSecret)
	};
}

export async function applicationEmailReadiness(s?: Settings): Promise<ApplicationEmailReadiness> {
	s ??= await getSettings();
	const reasons: string[] = [];
	if (!s.resendApiKey) reasons.push('Resend API-Key fehlt.');
	if (!normalizeDomain(s.resendDomain)) reasons.push('Versanddomain fehlt.');
	if (s.resendDomain && !DOMAIN_RE.test(normalizeDomain(s.resendDomain))) {
		reasons.push('Versanddomain ist ungültig.');
	}
	if (!s.applicationEmailEnabled) reasons.push('DNS-Einträge sind noch nicht bestätigt.');
	if (!applicationEmailFromAddress(s)) reasons.push('Absenderadresse fehlt.');
	if (!applicationEmailReplyTo(s)) reasons.push('Antwortadresse fehlt.');
	if (!s.resendWebhookSecret.trim()) reasons.push('Resend Webhook-Secret fehlt.');
	if (!(await getCvMeta())) reasons.push('Lebenslauf-PDF fehlt.');
	return { ready: reasons.length === 0, reasons };
}

function resendClient(s: Settings): Resend {
	if (!s.resendApiKey) throw new Error('Resend API-Key fehlt.');
	return new Resend(s.resendApiKey);
}

function ensureDomain(s: Settings): string {
	const domain = normalizeDomain(s.resendDomain);
	if (!domain || !DOMAIN_RE.test(domain)) throw new Error('Bitte gib eine gültige Domain ein.');
	return domain;
}

function toDnsRecords(records: ResendDomainRecord[] | undefined): ApplicationEmailDnsRecord[] {
	return (records ?? []).map((record) => ({
		record: String(record.record ?? record.name ?? ''),
		name: String(record.name ?? record.record ?? ''),
		type: String(record.type ?? ''),
		value: String(record.value ?? ''),
		ttl: String(record.ttl ?? ''),
		status: String(record.status ?? 'pending'),
		priority: typeof record.priority === 'number' ? record.priority : undefined
	}));
}

function resendErrorMessage(message: string | undefined): string {
	if (message?.includes('restricted to only send emails')) {
		return 'Dieser Resend API-Key darf nur E-Mails senden. Für die Domain-Prüfung benötigst du einen API-Key mit Vollzugriff.';
	}
	return 'Resend-Anfrage fehlgeschlagen.';
}

function unwrapResendData<T>(result: unknown): T {
	const response = result as { data?: T | null; error?: { message?: string } | null };
	if (response.error) throw new Error(resendErrorMessage(response.error.message));
	if (!response.data) throw new Error('Resend hat keine Daten zurückgegeben.');
	return response.data;
}

async function findDomainByName(client: Resend, domain: string): Promise<ResendDomain | null> {
	const result = await client.domains.list({ limit: 100 });
	const data = unwrapResendData<{ data?: ResendDomain[] } | ResendDomain[]>(result);
	const rows = Array.isArray(data) ? data : (data.data ?? []);
	return rows.find((item) => item.name === domain) ?? null;
}

async function readDomain(client: Resend, id: string): Promise<ResendDomain> {
	return unwrapResendData<ResendDomain>(await client.domains.get(id));
}

async function createDomain(client: Resend, domain: string): Promise<ResendDomain> {
	return unwrapResendData<ResendDomain>(
		await client.domains.create({
			name: domain,
			region: 'eu-west-1',
			openTracking: false,
			clickTracking: false,
			capabilities: {
				sending: 'enabled',
				receiving: 'disabled'
			}
		})
	);
}

export async function saveApplicationEmailSettings(input: {
	resendApiKey?: string;
	resendDomain: string;
	resendFromLocalPart: string;
	resendFromName: string;
	resendReplyTo: string;
	resendWebhookSecret?: string;
}): Promise<Settings> {
	const current = await getSettings();
	const domain = normalizeDomain(input.resendDomain);
	const domainChanged = domain !== current.resendDomain;
	const patch: Partial<Settings> = {
		resendDomain: domain,
		resendFromLocalPart: normalizeLocalPart(input.resendFromLocalPart),
		resendFromName: input.resendFromName.trim(),
		resendReplyTo: input.resendReplyTo.trim(),
		resendWebhookSecret: input.resendWebhookSecret?.trim() || current.resendWebhookSecret
	};
	if (input.resendApiKey?.trim()) patch.resendApiKey = input.resendApiKey.trim();
	if (domainChanged) {
		patch.resendDomainId = null;
		patch.resendDomainStatus = 'not_started';
		patch.resendDnsRecords = [];
		patch.resendDnsVerifiedAt = null;
		patch.applicationEmailEnabled = false;
	}
	return updateSettings(patch);
}

export async function syncResendDomain(): Promise<Settings> {
	const current = await getSettings();
	const client = resendClient(current);
	const domain = ensureDomain(current);
	const existing = current.resendDomainId
		? await readDomain(client, current.resendDomainId).catch(() => null)
		: await findDomainByName(client, domain);
	const next = existing ?? (await createDomain(client, domain));
	const patch: Partial<Settings> = {
		resendDomainId: next.id ?? current.resendDomainId,
		resendDomainStatus: next.status ?? 'pending',
		resendDnsRecords: toDnsRecords(next.records),
		applicationEmailEnabled: next.status === 'verified',
		resendDnsVerifiedAt: next.status === 'verified' ? new Date() : null
	};
	return updateSettings(patch);
}

export async function disableApplicationEmailSending(): Promise<void> {
	await db.update(settings).set({ applicationEmailEnabled: false }).where(eq(settings.id, 1));
}
