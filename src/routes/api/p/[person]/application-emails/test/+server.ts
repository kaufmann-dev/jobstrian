import { sendTestApplicationEmail } from '#lib/server/application-email/runner.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	try {
		const result = await sendTestApplicationEmail(person.id);
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
