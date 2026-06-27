import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../db/schema';

const { getCvMeta } = vi.hoisted(() => ({
	getCvMeta: vi.fn()
}));

vi.mock('../db', () => ({ db: {} }));
vi.mock('../settings', () => ({
	getSettings: vi.fn(),
	updateSettings: vi.fn()
}));
vi.mock('../cv', () => ({ getCvMeta }));

import { applicationEmailReadiness } from './config';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		resendApiKey: 're_test',
		resendDomain: 'example.com',
		resendFromLocalPart: 'bewerbung',
		resendFromName: 'Applicant',
		resendReplyTo: 'reply@example.com',
		resendWebhookSecret: 'whsec_test',
		applicationEmailEnabled: true,
		fullName: 'Applicant',
		email: 'reply@example.com',
		...patch
	} as Settings;
}

describe('applicationEmailReadiness', () => {
	beforeEach(() => {
		getCvMeta.mockResolvedValue({
			filename: 'cv.pdf',
			mimeType: 'application/pdf',
			size: 1024,
			uploadedAt: new Date()
		});
	});

	it('is ready when sender, DNS, webhook, API key and CV are configured', async () => {
		await expect(applicationEmailReadiness(settings())).resolves.toEqual({
			ready: true,
			reasons: []
		});
	});

	it('blocks sending when the Resend webhook secret is missing', async () => {
		const result = await applicationEmailReadiness(settings({ resendWebhookSecret: '  ' }));

		expect(result.ready).toBe(false);
		expect(result.reasons).toContain('Resend Webhook-Secret fehlt.');
	});
});
