import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	applicationEmail,
	applicationEmailSuppression,
	resendWebhookEvent
} from '$lib/server/db/schema';

const mocks = vi.hoisted(() => ({
	insert: vi.fn(),
	values: vi.fn(),
	update: vi.fn(),
	set: vi.fn(),
	select: vi.fn(),
	getSettings: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ db: mocks }));
vi.mock('$lib/server/settings', () => ({ getSettings: mocks.getSettings }));

import { POST } from './+server';

const signingKey = Buffer.from('local-webhook-regression-test-key');
const messageId = 'msg_webhook_regression';
// Matches the production bounce payload shape: the body has no top-level id.
const bounce = {
	created_at: '2026-09-12T07:10:29.055Z',
	data: {
		bounce: {
			diagnosticCode: ['smtp; 550 unknown recipient: route'],
			message: 'The recipient email provider sent a hard bounce message.',
			subType: 'General',
			type: 'Permanent'
		},
		created_at: '2026-09-12T07:10:25.982Z',
		email_id: '6589cdba-0d37-4416-acfc-a5dafa8240bb',
		from: 'Applicant <applicant@example.com>',
		headers: [{ name: 'Reply-To', value: 'applicant@example.com' }],
		message_id: '<outgoing-message@example.com>',
		subject: 'Application',
		tags: { kind: 'application-email', lead_id: '1524' },
		to: ['recipient@example.com']
	},
	type: 'email.bounced'
};

function signedRequest(payload: object = bounce): Request {
	const body = JSON.stringify(payload);
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const signature = createHmac('sha256', signingKey)
		.update(`${messageId}.${timestamp}.${body}`)
		.digest('base64');
	return new Request('https://jobstrian.example.com/api/webhooks/resend', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'svix-id': messageId,
			'svix-timestamp': timestamp,
			'svix-signature': `v1,${signature}`
		},
		body
	});
}

function invoke(request: Request) {
	return POST({ request } as Parameters<typeof POST>[0]);
}

describe('Resend webhook', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getSettings.mockResolvedValue({
			resendApiKey: 're_test',
			resendWebhookSecret: `whsec_${signingKey.toString('base64')}`
		});
		mocks.insert.mockReturnValue({ values: mocks.values });
		mocks.values.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
		mocks.select.mockReturnValue({
			from: () => ({ where: () => ({ limit: async () => [{ id: 42 }] }) })
		});
		mocks.update.mockReturnValue({ set: mocks.set });
		mocks.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
	});

	it.each(['email.bounced', 'email.complained'])(
		'accepts a signed %s without a body id and suppresses the recipient',
		async (type) => {
			const payload = { ...bounce, type };
			const response = await invoke(signedRequest(payload));

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ received: true });
			expect(mocks.insert).toHaveBeenCalledWith(resendWebhookEvent);
			expect(mocks.values).toHaveBeenCalledWith({ id: messageId, type, payload });
			expect(mocks.update).toHaveBeenCalledWith(applicationEmail);
			expect(mocks.set).toHaveBeenCalledWith({ status: 'failed', error: type });
			expect(mocks.insert).toHaveBeenCalledWith(applicationEmailSuppression);
			expect(mocks.values).toHaveBeenCalledWith({
				email: 'recipient@example.com',
				reason: type,
				sourceApplicationEmailId: 42
			});
		}
	);

	it.each(['missing', 'tampered'])('rejects a %s svix-id without writing data', async (mode) => {
		const request = signedRequest();
		if (mode === 'missing') request.headers.delete('svix-id');
		else request.headers.set('svix-id', 'msg_tampered');

		const response = await invoke(request);

		expect(response.status).toBe(400);
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it('rejects a signed payload without an event type', async () => {
		const response = await invoke(signedRequest({ data: bounce.data }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message: 'Webhook-Daten sind ungültig.' });
		expect(mocks.insert).not.toHaveBeenCalled();
	});
});
