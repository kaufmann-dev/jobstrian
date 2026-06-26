import { json } from '@sveltejs/kit';
import { applicationEmailDomainConfig, verifyResendDomain } from '$lib/server/application-email/config';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const settings = await verifyResendDomain();
		const config = applicationEmailDomainConfig(settings);
		if (!config.enabled) {
			return json(
				{
					config,
					message: 'DNS ist bei Resend noch nicht verifiziert. Prüfe die angezeigten Records.'
				},
				{ status: 400 }
			);
		}
		return json({ config });
	} catch (err) {
		console.error('[api/application-emails/domain/verify] verify failed:', err);
		return json(
			{ message: err instanceof Error ? err.message : 'DNS konnte nicht geprüft werden.' },
			{ status: 400 }
		);
	}
};
