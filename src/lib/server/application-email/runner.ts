import Renderer, { toPlainText } from 'better-svelte-email/render';
import { Resend } from 'resend';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, notExists, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
	applicationEmail,
	applicationEmailRun,
	applicationEmailSuppression,
	lead,
	type ApplicationEmail,
	type ApplicationEmailPhaseId,
	type ApplicationEmailPhaseProgress,
	type ApplicationEmailProgress,
	type ApplicationEmailRun,
	type Lead,
	type Settings
} from '../db/schema';
import { getSettings } from '../settings';
import { getCvData } from '../cv';
import {
	applicationEmailFromAddress,
	applicationEmailReadiness,
	applicationEmailReplyTo
} from './config';
import {
	nextApplicationEmailWindowStart,
	scheduleApplicationEmails,
	viennaDayBounds
} from './schedule';
import ApplicationEmailTemplate from './application-email-template.svelte';

const PROGRESS_FLUSH_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

type Counts = { queued: number; sent: number; failed: number; skipped: number };
type ActiveRun = { runId: number; controller: AbortController; startedAt: Date };
type InterruptedApplicationEmailRecovery = 'resumed' | 'canceled' | 'ignored';

let activeRun: ActiveRun | null = null;
let starting = false;

export type ApplicationEmailSummary = {
	ready: boolean;
	reasons: string[];
	eligibleCount: number;
	latestRun: ApplicationEmailRun | null;
	running: boolean;
};

export type TestApplicationEmailResult = {
	recipient: string;
	resendEmailId: string | null;
};

type ApplicationEmailSendInput = {
	settings: Settings;
	recipientEmail: string;
	subject: string;
	body: string;
	tags: { name: string; value: string }[];
	idempotencyKey: string;
};

const TEST_EMAIL_SUBJECT = 'Jobstrian Test-E-Mail';
const TEST_EMAIL_BODY = `Hallo,

das ist eine Test-E-Mail aus Jobstrian.

Wenn diese Nachricht gut lesbar ist und der Lebenslauf als PDF angehängt wurde, funktionieren Absender, Antwortadresse, Formatierung und Resend-Versand.`;

function emptyPhase(): ApplicationEmailPhaseProgress {
	return { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 };
}

function createProgress(headline = 'Bewerbungsversand startet'): ApplicationEmailProgress {
	return {
		version: 1,
		headline,
		detail: '',
		nextSendAt: null,
		phases: {
			setup: emptyPhase(),
			queue: emptyPhase(),
			send: emptyPhase(),
			finalize: emptyPhase()
		}
	};
}

function progressOrDefault(progress: ApplicationEmailRun['progress']): ApplicationEmailProgress {
	if (
		progress &&
		progress.version === 1 &&
		progress.phases?.setup &&
		progress.phases.queue &&
		progress.phases.send &&
		progress.phases.finalize
	) {
		return progress;
	}
	return createProgress();
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortReason(signal);
}

function isAbortLike(err: unknown): boolean {
	return err instanceof Error && /aborted|abort/i.test(err.message);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		const abort = () => {
			clearTimeout(timeout);
			reject(abortReason(signal));
		};
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
	});
}

class ProgressWriter {
	private lastFlush = 0;

	constructor(
		private readonly runId: number,
		readonly counts: Counts,
		readonly progress: ApplicationEmailProgress
	) {}

	phase(
		id: ApplicationEmailPhaseId,
		patch: Partial<ApplicationEmailPhaseProgress>,
		headline?: string
	) {
		this.progress.phases[id] = { ...this.progress.phases[id], ...patch };
		if (headline) this.progress.headline = headline;
		if (patch.detail != null) this.progress.detail = patch.detail;
	}

	nextSendAt(value: Date | null): void {
		this.progress.nextSendAt = value?.toISOString() ?? null;
	}

	cancelRunning(): void {
		for (const id of Object.keys(this.progress.phases) as ApplicationEmailPhaseId[]) {
			const phase = this.progress.phases[id];
			if (phase.state === 'running') this.phase(id, { state: 'canceled', detail: 'Abgebrochen' });
		}
		this.progress.headline = 'Bewerbungsversand abgebrochen';
		this.progress.detail = 'Der Versand wurde abgebrochen.';
	}

	async flush(force = false): Promise<void> {
		const now = Date.now();
		if (!force && now - this.lastFlush < PROGRESS_FLUSH_INTERVAL_MS) return;
		this.lastFlush = now;
		await db
			.update(applicationEmailRun)
			.set({ phase: this.progress.headline, counts: this.counts, progress: this.progress })
			.where(eq(applicationEmailRun.id, this.runId));
	}
}

export function hasActiveApplicationEmailRun(runId?: number): boolean {
	return activeRun !== null && (runId == null || activeRun.runId === runId);
}

async function eligibleLeadCount(): Promise<number> {
	const [row] = await db.select({ value: count() }).from(lead).where(eligibleLeadWhere());
	return row?.value ?? 0;
}

function eligibleLeadWhere() {
	const normalizedSuppression = sql`lower(${applicationEmailSuppression.email}) = lower(${lead.email})`;
	return and(
		eq(lead.status, 'new'),
		isNotNull(lead.email),
		sql`length(btrim(${lead.draftSubject})) > 0`,
		sql`length(btrim(${lead.draftBody})) > 0`,
		notExists(
			db
				.select({ value: sql`1` })
				.from(applicationEmail)
				.where(eq(applicationEmail.leadId, lead.id))
		),
		notExists(
			db
				.select({ value: sql`1` })
				.from(applicationEmailSuppression)
				.where(normalizedSuppression)
		)
	);
}

async function eligibleLeads(): Promise<Lead[]> {
	return db
		.select()
		.from(lead)
		.where(eligibleLeadWhere())
		.orderBy(desc(lead.starred), desc(lead.rankScore), asc(lead.distanceMeters), asc(lead.id));
}

async function latestRun(): Promise<ApplicationEmailRun | null> {
	const [row] = await db
		.select()
		.from(applicationEmailRun)
		.orderBy(desc(applicationEmailRun.id))
		.limit(1);
	return row ?? null;
}

export async function getApplicationEmailSummary(): Promise<ApplicationEmailSummary> {
	const [settings, latest, eligible] = await Promise.all([
		getSettings(),
		latestRun(),
		eligibleLeadCount()
	]);
	const readiness = await applicationEmailReadiness(settings);
	return {
		...readiness,
		eligibleCount: eligible,
		latestRun: latest,
		running: latest ? latest.status === 'running' || latest.status === 'canceling' : false
	};
}

async function queuedRows(runId: number): Promise<ApplicationEmail[]> {
	return db
		.select()
		.from(applicationEmail)
		.where(
			and(
				eq(applicationEmail.runId, runId),
				or(eq(applicationEmail.status, 'queued'), eq(applicationEmail.status, 'sending'))
			)
		)
		.orderBy(asc(applicationEmail.scheduledAt), asc(applicationEmail.id));
}

async function refreshCounts(runId: number): Promise<Counts> {
	const rows = await db
		.select({ status: applicationEmail.status, value: count() })
		.from(applicationEmail)
		.where(eq(applicationEmail.runId, runId))
		.groupBy(applicationEmail.status);
	const counts: Counts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
	for (const row of rows) {
		if (row.status === 'sent') counts.sent = row.value;
		else if (row.status === 'failed') counts.failed = row.value;
		else if (row.status === 'skipped' || row.status === 'canceled') counts.skipped += row.value;
		else counts.queued += row.value;
	}
	return counts;
}

async function cancelPendingRows(runId: number, counts: Counts): Promise<void> {
	const pending = await queuedRows(runId);
	if (!pending.length) return;
	// Delete (don't merely mark 'canceled') the not-yet-sent rows so the lead is freed for
	// future outreach: this clears both the eligibleLeadWhere() notExists check and the unique
	// application_email_lead_id index that would otherwise permanently block re-queuing.
	await db.delete(applicationEmail).where(
		inArray(
			applicationEmail.id,
			pending.map((row) => row.id)
		)
	);
	counts.skipped += pending.length;
	counts.queued = Math.max(0, counts.queued - pending.length);
}

async function sentTodayCount(from: Date): Promise<number> {
	const { start, end } = viennaDayBounds(from);
	const [row] = await db
		.select({ value: count() })
		.from(applicationEmail)
		.where(
			and(
				eq(applicationEmail.status, 'sent'),
				gte(applicationEmail.sentAt, start),
				lt(applicationEmail.sentAt, end)
			)
		);
	return row?.value ?? 0;
}

async function queueRun(runId: number, rows: Lead[], dailyLimit: number): Promise<number> {
	if (!rows.length) return 0;
	const from = new Date();
	const scheduled = scheduleApplicationEmails(rows.length, {
		from,
		dailyLimit,
		alreadySentToday: await sentTodayCount(from)
	});
	await db
		.insert(applicationEmail)
		.values(
			rows.map((row, index) => ({
				runId,
				leadId: row.id,
				recipientEmail: row.email!,
				leadName: row.name,
				subject: row.draftSubject!,
				body: row.draftBody!,
				scheduledAt: scheduled[index],
				idempotencyKey: `application-email-lead-${row.id}`
			}))
		)
		.onConflictDoNothing();
	const [inserted] = await db
		.select({ value: count() })
		.from(applicationEmail)
		.where(eq(applicationEmail.runId, runId));
	return inserted?.value ?? 0;
}

export function repaceScheduledAt<T extends { id: number; scheduledAt: Date }>(
	rows: T[],
	from = new Date(),
	options: { dailyLimit?: number; alreadySentToday?: number } = {}
): Map<number, Date> {
	const ordered = [...rows].sort(
		(a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id - b.id
	);
	const scheduled = scheduleApplicationEmails(ordered.length, { from, ...options });
	return new Map(ordered.map((row, index) => [row.id, scheduled[index]]));
}

async function repaceQueuedRows(runId: number): Promise<void> {
	const rows = await db
		.select({ id: applicationEmail.id, scheduledAt: applicationEmail.scheduledAt })
		.from(applicationEmail)
		.where(and(eq(applicationEmail.runId, runId), eq(applicationEmail.status, 'queued')))
		.orderBy(asc(applicationEmail.scheduledAt), asc(applicationEmail.id));
	if (!rows.length) return;
	const settings = await getSettings();
	const from = new Date();
	const repaced = repaceScheduledAt(rows, from, {
		dailyLimit: settings.applicationEmailDailyLimit,
		alreadySentToday: await sentTodayCount(from)
	});
	for (const [id, scheduledAt] of repaced) {
		await db.update(applicationEmail).set({ scheduledAt }).where(eq(applicationEmail.id, id));
	}
}

function resendClient(s: Settings): Resend {
	if (!s.resendApiKey) throw new Error('Resend API-Key fehlt.');
	return new Resend(s.resendApiKey);
}

function unwrapSendId(result: unknown): string | null {
	const response = result as {
		data?: { id?: string } | null;
		error?: { message?: string; statusCode?: number } | null;
	};
	if (response.error) {
		throw new Error(
			response.error.message
				? `Resend-Versand fehlgeschlagen: ${response.error.message}`
				: 'Resend-Versand fehlgeschlagen.'
		);
	}
	return response.data?.id ?? null;
}

function testEmailReadiness(settings: Settings): string[] {
	const reasons: string[] = [];
	if (!settings.resendApiKey) reasons.push('Resend API-Key fehlt.');
	if (!settings.applicationEmailEnabled) reasons.push('DNS-Einträge sind noch nicht bestätigt.');
	if (!applicationEmailFromAddress(settings)) reasons.push('Absenderadresse fehlt.');
	if (!applicationEmailReplyTo(settings)) reasons.push('Antwortadresse fehlt.');
	return reasons;
}

async function sendRenderedApplicationEmail(
	input: ApplicationEmailSendInput
): Promise<string | null> {
	const cv = await getCvData();
	if (!cv) throw new Error('Lebenslauf-PDF fehlt.');
	const html = await new Renderer().render(ApplicationEmailTemplate, {
		props: {
			body: input.body
		}
	});
	const text = toPlainText(html) || input.body;
	const result = await resendClient(input.settings).emails.send(
		{
			from: applicationEmailFromAddress(input.settings),
			to: input.recipientEmail,
			replyTo: applicationEmailReplyTo(input.settings),
			subject: input.subject,
			html,
			text,
			attachments: [
				{
					filename: cv.filename,
					content: cv.data,
					contentType: cv.mimeType
				}
			],
			tags: input.tags
		},
		{ idempotencyKey: input.idempotencyKey }
	);
	return unwrapSendId(result);
}

async function sendApplicationEmail(
	row: ApplicationEmail,
	settings: Settings
): Promise<string | null> {
	return sendRenderedApplicationEmail({
		settings,
		recipientEmail: row.recipientEmail,
		subject: row.subject,
		body: row.body,
		tags: [
			{ name: 'kind', value: 'application-email' },
			{ name: 'lead_id', value: String(row.leadId) }
		],
		idempotencyKey: row.idempotencyKey
	});
}

export async function sendTestApplicationEmail(): Promise<TestApplicationEmailResult> {
	const settings = await getSettings();
	const readiness = testEmailReadiness(settings);
	const recipient = applicationEmailReplyTo(settings);
	if (readiness.length) {
		throw new Error(`Test-E-Mail kann nicht gesendet werden: ${readiness.join(' ')}`);
	}
	const resendEmailId = await sendRenderedApplicationEmail({
		settings,
		recipientEmail: recipient,
		subject: TEST_EMAIL_SUBJECT,
		body: TEST_EMAIL_BODY,
		tags: [{ name: 'kind', value: 'application-email-test' }],
		idempotencyKey: `application-email-test-${crypto.randomUUID()}`
	});
	return { recipient, resendEmailId };
}

async function sendQueuedRow(
	row: ApplicationEmail,
	writer: ProgressWriter
): Promise<'sent' | 'failed' | 'requeued'> {
	const settings = await getSettings();
	await db
		.update(applicationEmail)
		.set({ status: 'sending', attempts: row.attempts + 1, error: null })
		.where(eq(applicationEmail.id, row.id));
	try {
		const resendEmailId = await sendApplicationEmail(row, settings);
		await db
			.update(applicationEmail)
			.set({ status: 'sent', resendEmailId, sentAt: new Date(), error: null })
			.where(eq(applicationEmail.id, row.id));
		await db.update(lead).set({ status: 'contacted' }).where(eq(lead.id, row.leadId));
		writer.counts.sent++;
		return 'sent';
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const attempts = row.attempts + 1;
		if (attempts < MAX_ATTEMPTS) {
			await db
				.update(applicationEmail)
				.set({
					status: 'queued',
					attempts,
					scheduledAt: nextApplicationEmailWindowStart(
						new Date(Date.now() + attempts * 5 * 60_000)
					),
					error: message
				})
				.where(eq(applicationEmail.id, row.id));
			return 'requeued';
		}
		await db
			.update(applicationEmail)
			.set({ status: 'failed', attempts, error: message })
			.where(eq(applicationEmail.id, row.id));
		writer.counts.failed++;
		return 'failed';
	}
}

async function runApplicationEmailWorker(
	runId: number,
	signal: AbortSignal,
	progress = createProgress()
): Promise<void> {
	const counts = await refreshCounts(runId);
	const writer = new ProgressWriter(runId, counts, progress);
	try {
		writer.phase('setup', { state: 'done', current: 1, total: 1, detail: 'Versand geprüft' });
		writer.phase('queue', {
			state: 'done',
			current: counts.queued + counts.sent + counts.failed + counts.skipped,
			total: counts.queued + counts.sent + counts.failed + counts.skipped,
			detail: `${counts.queued} E-Mails in der Warteschlange`
		});
		await writer.flush(true);

		while (true) {
			throwIfAborted(signal);
			const [run] = await db
				.select()
				.from(applicationEmailRun)
				.where(eq(applicationEmailRun.id, runId))
				.limit(1);
			if (!run || run.status === 'canceling') throw abortReason(signal);

			const [next] = await queuedRows(runId);
			if (!next) break;
			const total = counts.queued + counts.sent + counts.failed + counts.skipped;
			writer.phase(
				'send',
				{
					state: 'running',
					current: counts.sent + counts.failed + counts.skipped,
					total,
					detail: '',
					failed: counts.failed,
					skipped: counts.skipped
				},
				'Bewerbungen werden versendet'
			);
			writer.nextSendAt(next.scheduledAt);
			await writer.flush(true);
			await sleep(next.scheduledAt.getTime() - Date.now(), signal);
			const result = await sendQueuedRow(next, writer);
			if (result !== 'requeued') counts.queued = Math.max(0, counts.queued - 1);
			writer.nextSendAt(null);
			await writer.flush(true);
		}

		writer.phase('send', {
			state: counts.failed > 0 ? 'warning' : 'done',
			current: counts.sent + counts.failed + counts.skipped,
			total: counts.sent + counts.failed + counts.skipped,
			detail: `${counts.sent} gesendet, ${counts.failed} fehlgeschlagen`,
			failed: counts.failed,
			skipped: counts.skipped
		});
		writer.phase('finalize', { state: 'done', current: 1, total: 1, detail: 'Fertig' });
		writer.progress.headline = 'Bewerbungsversand abgeschlossen';
		writer.progress.detail = 'Fertig';
		await writer.flush(true);
		await db
			.update(applicationEmailRun)
			.set({
				status: counts.failed > 0 ? 'error' : 'done',
				phase: writer.progress.headline,
				finishedAt: new Date(),
				counts,
				progress: writer.progress,
				error: counts.failed > 0 ? `${counts.failed} E-Mails fehlgeschlagen.` : null
			})
			.where(eq(applicationEmailRun.id, runId));
	} catch (err) {
		if (isAbortLike(err) || signal.aborted) {
			await cancelPendingRows(runId, counts);
			writer.cancelRunning();
			await writer.flush(true);
			await db
				.update(applicationEmailRun)
				.set({
					status: 'canceled',
					phase: 'Abgebrochen',
					finishedAt: new Date(),
					counts,
					progress: writer.progress
				})
				.where(eq(applicationEmailRun.id, runId));
			return;
		}

		console.error('[application-email] Lauf fehlgeschlagen:', err);
		writer.progress.headline = 'Bewerbungsversand fehlgeschlagen';
		writer.progress.detail = err instanceof Error ? err.message : String(err);
		for (const id of Object.keys(writer.progress.phases) as ApplicationEmailPhaseId[]) {
			const phase = writer.progress.phases[id];
			if (phase.state === 'running') {
				writer.phase(id, {
					state: 'error',
					detail: writer.progress.detail,
					failed: phase.failed + 1
				});
			}
		}
		await writer.flush(true);
		await db
			.update(applicationEmailRun)
			.set({
				status: 'error',
				phase: 'Fehler',
				finishedAt: new Date(),
				counts,
				progress: writer.progress,
				error: writer.progress.detail
			})
			.where(eq(applicationEmailRun.id, runId));
	} finally {
		if (activeRun?.runId === runId) activeRun = null;
	}
}

export async function startApplicationEmailRun(): Promise<number | null> {
	if (activeRun || starting) return null;
	starting = true;
	try {
		const settings = await getSettings();
		const readiness = await applicationEmailReadiness(settings);
		if (!readiness.ready) {
			throw new Error(`Bewerbungsversand ist noch nicht bereit. ${readiness.reasons.join(' ')}`);
		}

		const [run] = await db
			.insert(applicationEmailRun)
			.values({ status: 'running', phase: 'Bewerbungsversand startet', progress: createProgress() })
			.returning();
		const rows = await eligibleLeads();
		const queued = await queueRun(run.id, rows, settings.applicationEmailDailyLimit);
		const counts: Counts = { queued, sent: 0, failed: 0, skipped: rows.length - queued };
		const progress = createProgress(
			queued > 0 ? 'Bewerbungen werden vorbereitet' : 'Keine E-Mails offen'
		);
		progress.phases.setup = {
			state: 'done',
			current: 1,
			total: 1,
			detail: 'Versand geprüft',
			skipped: 0,
			failed: 0
		};
		progress.phases.queue = {
			state: 'done',
			current: rows.length,
			total: rows.length,
			detail: `${queued} E-Mails eingeplant`,
			skipped: counts.skipped,
			failed: 0
		};
		await db
			.update(applicationEmailRun)
			.set({
				counts,
				progress,
				phase: progress.headline,
				status: queued > 0 ? 'running' : 'done',
				finishedAt: queued > 0 ? null : new Date()
			})
			.where(eq(applicationEmailRun.id, run.id));
		if (queued === 0) return run.id;

		const controller = new AbortController();
		activeRun = { runId: run.id, controller, startedAt: new Date() };
		void runApplicationEmailWorker(run.id, controller.signal, progress);
		return run.id;
	} finally {
		starting = false;
	}
}

export async function cancelApplicationEmailRun(runId: number): Promise<{ active: boolean }> {
	const active = activeRun?.runId === runId ? activeRun : null;
	await db
		.update(applicationEmailRun)
		.set({ status: 'canceling', cancelRequestedAt: new Date(), phase: 'Abbruch angefordert' })
		.where(and(eq(applicationEmailRun.id, runId), eq(applicationEmailRun.status, 'running')));
	if (active)
		active.controller.abort(new DOMException('Bewerbungsversand abgebrochen.', 'AbortError'));
	return { active: Boolean(active) };
}

async function finishInterruptedCancelingRun(run: ApplicationEmailRun): Promise<void> {
	const counts = await refreshCounts(run.id);
	await cancelPendingRows(run.id, counts);
	const writer = new ProgressWriter(run.id, counts, progressOrDefault(run.progress));
	writer.cancelRunning();
	await writer.flush(true);
	await db
		.update(applicationEmailRun)
		.set({
			status: 'canceled',
			phase: 'Abgebrochen',
			finishedAt: new Date(),
			counts,
			progress: writer.progress,
			error: null
		})
		.where(eq(applicationEmailRun.id, run.id));
}

export async function recoverInterruptedApplicationEmailRun(
	runId: number
): Promise<InterruptedApplicationEmailRecovery> {
	if (activeRun || starting) return 'ignored';
	starting = true;
	try {
		const [run] = await db
			.select()
			.from(applicationEmailRun)
			.where(eq(applicationEmailRun.id, runId))
			.limit(1);
		if (!run) return 'ignored';
		if (run.status === 'canceling') {
			await finishInterruptedCancelingRun(run);
			return 'canceled';
		}
		if (run.status !== 'running') return 'ignored';

		const controller = new AbortController();
		activeRun = { runId, controller, startedAt: new Date() };
		try {
			await db
				.update(applicationEmail)
				.set({ status: 'queued' })
				.where(and(eq(applicationEmail.runId, runId), eq(applicationEmail.status, 'sending')));
			await repaceQueuedRows(runId);
			void runApplicationEmailWorker(runId, controller.signal, progressOrDefault(run.progress));
		} catch (err) {
			if (activeRun?.runId === runId) activeRun = null;
			throw err;
		}
		return 'resumed';
	} finally {
		starting = false;
	}
}
