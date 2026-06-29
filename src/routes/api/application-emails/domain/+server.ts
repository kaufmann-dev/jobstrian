import { json } from '@sveltejs/kit';
import {
	applicationEmailDomainConfig,
	syncResendDomain
} from '$lib/server/application-email/config';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const settings = await syncResendDomain();
		return json({ config: applicationEmailDomainConfig(settings) });
	} catch (err) {
		console.error('[api/application-emails/domain] Synchronisierung fehlgeschlagen:', err);
		return json(
			{
				message: err instanceof Error ? err.message : 'DNS-Einträge konnten nicht geladen werden.'
			},
			{ status: 400 }
		);
	}
};
