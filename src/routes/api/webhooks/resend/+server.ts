import { Resend } from 'resend';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	applicationEmail,
	applicationEmailSuppression,
	resendWebhookEvent
} from '$lib/server/db/schema';
import { getSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

type ResendWebhookPayload = {
	id?: string;
	type?: string;
	data?: {
		email_id?: string;
		to?: string | string[];
	};
};

function firstRecipient(value: unknown): string | null {
	if (typeof value === 'string') return value.toLowerCase();
	if (Array.isArray(value)) {
		const first = value.find((item): item is string => typeof item === 'string');
		return first?.toLowerCase() ?? null;
	}
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const settings = await getSettings();
	if (!settings.resendWebhookSecret) {
		return json({ message: 'Webhook secret is not configured.' }, { status: 400 });
	}

	const payload = await request.text();
	let event: ResendWebhookPayload;
	try {
		event = (await new Resend(settings.resendApiKey).webhooks.verify({
			payload,
			headers: {
				'id': request.headers.get('svix-id') ?? '',
				'timestamp': request.headers.get('svix-timestamp') ?? '',
				'signature': request.headers.get('svix-signature') ?? ''
			},
			webhookSecret: settings.resendWebhookSecret
		})) as ResendWebhookPayload;
	} catch {
		return json({ message: 'Invalid webhook signature.' }, { status: 400 });
	}

	if (!event.id || !event.type) return json({ message: 'Invalid webhook payload.' }, { status: 400 });

	await db
		.insert(resendWebhookEvent)
		.values({ id: event.id, type: event.type, payload: event as Record<string, unknown> })
		.onConflictDoNothing();

	if (event.type === 'email.bounced' || event.type === 'email.complained') {
		const emailId = event.data?.email_id;
		const recipient = firstRecipient(event.data?.to);
		let sourceId: number | null = null;
		if (emailId) {
			const [sent] = await db
				.select()
				.from(applicationEmail)
				.where(eq(applicationEmail.resendEmailId, emailId))
				.limit(1);
			sourceId = sent?.id ?? null;
			if (sent) {
				await db
					.update(applicationEmail)
					.set({ status: 'failed', error: event.type })
					.where(eq(applicationEmail.id, sent.id));
			}
		}
		if (recipient) {
			await db
				.insert(applicationEmailSuppression)
				.values({
					email: recipient,
					reason: event.type,
					sourceApplicationEmailId: sourceId
				})
				.onConflictDoNothing();
		}
	}

	return json({ received: true });
};
