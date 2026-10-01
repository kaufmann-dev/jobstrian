import {
	applicationEmailDomainConfig,
	syncResendDomain
} from '#lib/server/application-email/config.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const settings = await syncResendDomain();
		return Response.json({ config: applicationEmailDomainConfig(settings) });
	} catch (err) {
		console.error('[api/application-emails/domain] Synchronisierung fehlgeschlagen:', err);
		return Response.json(
			{
				message: err instanceof Error ? err.message : 'DNS-Einträge konnten nicht geladen werden.'
			},
			{ status: 400 }
		);
	}
};
