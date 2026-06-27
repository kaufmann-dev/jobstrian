import { beforeEach, describe, expect, it, vi } from 'vitest';

type RunRow = {
	id: number;
	status: 'running' | 'canceling' | 'canceled' | 'done' | 'error';
	phase: string;
	counts: { queued: number; sent: number; failed: number; skipped: number };
	progress: ReturnType<typeof progress>;
	finishedAt: Date | null;
	error: string | null;
};

type EmailRow = {
	id: number;
	runId: number;
	leadId: number;
	recipientEmail: string;
	leadName: string;
	subject: string;
	body: string;
	status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'canceled';
	scheduledAt: Date;
	sentAt: Date | null;
	attempts: number;
	resendEmailId: string | null;
	idempotencyKey: string;
	error: string | null;
};

function progress() {
	return {
		version: 1 as const,
		headline: 'Bewerbungen werden versendet',
		detail: '',
		nextSendAt: null,
		phases: {
			setup: { state: 'done' as const, current: 1, total: 1, detail: '', skipped: 0, failed: 0 },
			queue: { state: 'done' as const, current: 1, total: 1, detail: '', skipped: 0, failed: 0 },
			send: { state: 'running' as const, current: 0, total: 1, detail: '', skipped: 0, failed: 0 },
			finalize: {
				state: 'pending' as const,
				current: 0,
				total: 0,
				detail: '',
				skipped: 0,
				failed: 0
			}
		}
	};
}

const fake = vi.hoisted(() => {
	type MutableRunRow = {
		id: number;
		status: string;
		phase: string;
		counts: { queued: number; sent: number; failed: number; skipped: number };
		progress: ReturnType<typeof progress>;
		finishedAt: Date | null;
		error: string | null;
	};
	type MutableEmailRow = {
		id: number;
		runId: number;
		leadId: number;
		recipientEmail: string;
		leadName: string;
		subject: string;
		body: string;
		status: string;
		scheduledAt: Date;
		sentAt: Date | null;
		attempts: number;
		resendEmailId: string | null;
		idempotencyKey: string;
		error: string | null;
	};
	type MutableLeadRow = { id: number; status: string };

	const state = {
		runs: [] as MutableRunRow[],
		emails: [] as MutableEmailRow[],
		leads: [] as MutableLeadRow[],
		sendCalls: [] as Array<{ idempotencyKey: string | undefined }>
	};

	function tableName(table: unknown): string {
		const named = table as { _?: { name?: string } };
		if (named._?.name) return named._.name;
		for (const symbol of Object.getOwnPropertySymbols(table as object)) {
			const value = (table as Record<PropertyKey, unknown>)[symbol];
			if (typeof value === 'string') return value;
		}
		return '';
	}

	function cloneRows(name: string): unknown[] {
		if (name === 'application_email_run') return state.runs;
		if (name === 'application_email') {
			return state.emails
				.filter((row) => row.status === 'queued' || row.status === 'sending')
				.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id - b.id);
		}
		return [];
	}

	function groupedEmailCounts() {
		const groups = new Map<string, number>();
		for (const row of state.emails) groups.set(row.status, (groups.get(row.status) ?? 0) + 1);
		return Array.from(groups, ([status, value]) => ({ status, value }));
	}

	function updateRows(name: string, patch: Record<string, unknown>) {
		if (name === 'application_email_run') {
			Object.assign(state.runs[0], patch);
			return;
		}
		if (name === 'lead') {
			Object.assign(state.leads[0], patch);
			return;
		}
		if (name !== 'application_email') return;

		if (patch.status === 'queued') {
			for (const row of state.emails) {
				if (row.status === 'sending') Object.assign(row, patch);
			}
			return;
		}
		if (patch.status === 'sending') {
			const row = state.emails.find(
				(email) => email.status === 'queued' || email.status === 'sending'
			);
			if (row) Object.assign(row, patch);
			return;
		}
		if (patch.status === 'sent') {
			const row = state.emails.find((email) => email.status === 'sending');
			if (row) Object.assign(row, patch);
			return;
		}
		if (patch.status === 'canceled') {
			for (const row of state.emails) {
				if (row.status === 'queued' || row.status === 'sending') Object.assign(row, patch);
			}
		}
	}

	const db = {
		select() {
			return {
				from(table: unknown) {
					const name = tableName(table);
					const builder = {
						where() {
							return builder;
						},
						orderBy() {
							return Promise.resolve(cloneRows(name));
						},
						groupBy() {
							return Promise.resolve(groupedEmailCounts());
						},
						limit(count: number) {
							return Promise.resolve(cloneRows(name).slice(0, count));
						}
					};
					return builder;
				}
			};
		},
		update(table: unknown) {
			const name = tableName(table);
			return {
				set(patch: Record<string, unknown>) {
					return {
						where() {
							updateRows(name, patch);
							return Promise.resolve([]);
						}
					};
				}
			};
		}
	};

	return {
		db,
		state,
		reset() {
			state.runs = [];
			state.emails = [];
			state.leads = [];
			state.sendCalls = [];
		}
	};
});

vi.mock('../db', () => ({ db: fake.db }));
vi.mock('../settings', () => ({
	getSettings: vi.fn(async () => ({
		resendApiKey: 'test-key',
		resendDomain: 'example.com',
		resendFromLocalPart: 'bewerbung',
		resendFromName: 'Applicant',
		resendReplyTo: 'reply@example.com',
		fullName: 'Applicant',
		email: 'reply@example.com'
	}))
}));
vi.mock('../cv', () => ({
	getCvData: vi.fn(async () => ({
		filename: 'cv.pdf',
		mimeType: 'application/pdf',
		data: Buffer.from('pdf')
	}))
}));
vi.mock('better-svelte-email/render', () => ({
	default: class Renderer {
		async render() {
			return '<p>Application</p>';
		}
	},
	toPlainText: vi.fn(() => 'Application')
}));
vi.mock('resend', () => ({
	Resend: class Resend {
		emails = {
			send: async (_payload: unknown, options?: { idempotencyKey?: string }) => {
				fake.state.sendCalls.push({ idempotencyKey: options?.idempotencyKey });
				return { data: { id: `resend-${fake.state.sendCalls.length}` } };
			}
		};
	}
}));
vi.mock('./application-email-template.svelte', () => ({ default: {} }));

import { recoverInterruptedApplicationEmailRun, repaceScheduledAt } from './runner';
import { isApplicationEmailSendWindow } from './schedule';

function seedRun(status: RunRow['status']): RunRow {
	return {
		id: 1,
		status,
		phase: 'Bewerbungen werden versendet',
		counts: { queued: 1, sent: 0, failed: 0, skipped: 0 },
		progress: progress(),
		finishedAt: null,
		error: null
	};
}

function seedEmail(status: EmailRow['status'], id = 10): EmailRow {
	return {
		id,
		runId: 1,
		leadId: 100 + id,
		recipientEmail: `lead-${id}@example.com`,
		leadName: `Lead ${id}`,
		subject: 'Application',
		body: 'Hello',
		status,
		scheduledAt: new Date(Date.now() - 1000),
		sentAt: null,
		attempts: 1,
		resendEmailId: null,
		idempotencyKey: `application-email-lead-${100 + id}`,
		error: null
	};
}

describe('interrupted application e-mail recovery', () => {
	beforeEach(() => {
		fake.reset();
	});

	it('resumes a stale running run and sends its existing sending row', async () => {
		fake.state.runs.push(seedRun('running'));
		fake.state.emails.push(seedEmail('sending'));
		fake.state.leads.push({ id: 110, status: 'new' });

		const result = await recoverInterruptedApplicationEmailRun(1);

		expect(result).toBe('resumed');
		await vi.waitFor(() => expect(fake.state.runs[0].status).toBe('done'));
		expect(fake.state.emails).toHaveLength(1);
		expect(fake.state.emails[0].status).toBe('sent');
		expect(fake.state.emails[0].resendEmailId).toBe('resend-1');
		expect(fake.state.leads[0].status).toBe('contacted');
		expect(fake.state.sendCalls).toEqual([{ idempotencyKey: 'application-email-lead-110' }]);
	});

	it('re-anchors past-due queued rows forward into the business window without bursting', async () => {
		// Simulate a run interrupted overnight: every row is past-due (would burst at 0ms spacing)
		// and was scheduled outside business hours.
		const from = new Date('2026-06-29T07:00:00.000Z'); // Mon 09:00 Europe/Vienna
		const rows = [
			{ id: 30, scheduledAt: new Date('2026-06-28T20:00:00.000Z') },
			{ id: 12, scheduledAt: new Date('2026-06-28T19:00:00.000Z') },
			{ id: 21, scheduledAt: new Date('2026-06-28T19:30:00.000Z') }
		];

		const repaced = repaceScheduledAt(rows, from);

		// Order preserved: by original scheduledAt, then id.
		expect([...repaced.keys()]).toEqual([12, 21, 30]);

		const times = [...repaced.values()];
		// Nothing past-due relative to the resume moment.
		for (const time of times) {
			expect(time.getTime()).toBeGreaterThanOrEqual(from.getTime());
			expect(isApplicationEmailSendWindow(time)).toBe(true);
		}
		// No back-to-back burst: consecutive sends are at least two minutes apart.
		for (let i = 1; i < times.length; i++) {
			expect(times[i].getTime() - times[i - 1].getTime()).toBeGreaterThanOrEqual(2 * 60_000);
		}
	});

	it('finishes a stale canceling run without resuming pending sends', async () => {
		const sent = seedEmail('sent', 11);
		sent.resendEmailId = 'already-sent';
		sent.sentAt = new Date();
		fake.state.runs.push(seedRun('canceling'));
		fake.state.emails.push(sent, seedEmail('queued', 12), seedEmail('sending', 13));
		fake.state.leads.push({ id: 111, status: 'contacted' });

		const result = await recoverInterruptedApplicationEmailRun(1);

		expect(result).toBe('canceled');
		expect(fake.state.runs[0].status).toBe('canceled');
		expect(fake.state.runs[0].counts).toEqual({ queued: 0, sent: 1, failed: 0, skipped: 2 });
		expect(fake.state.emails.map((row) => row.status)).toEqual(['sent', 'canceled', 'canceled']);
		expect(fake.state.sendCalls).toEqual([]);
	});
});
