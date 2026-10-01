import { sendTestApplicationEmail } from '#lib/server/application-email/runner.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const result = await sendTestApplicationEmail();
		return Response.json({ sent: true, ...result });
	} catch (err) {
		console.error('[api/application-emails/test] Test-E-Mail fehlgeschlagen:', err);
		return Response.json(
			{
				sent: false,
				message: err instanceof Error ? err.message : 'Test-E-Mail konnte nicht gesendet werden.'
			},
			{ status: 400 }
		);
	}
};
