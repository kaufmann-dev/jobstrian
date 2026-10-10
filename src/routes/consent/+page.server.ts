import { error } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.js';
import { MCP_SCOPES } from '#lib/server/mcp/scopes.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request }) => {
	const clientId = url.searchParams.get('client_id');
	if (!clientId || !url.searchParams.has('sig')) {
		error(400, 'Diese Autorisierungsanfrage ist unvollständig oder abgelaufen.');
	}
	const client = await auth.api
		.getOAuthClientPublic({ query: { client_id: clientId }, headers: request.headers })
		.catch(() => null);
	if (!client) error(400, 'Unbekannte Anwendung.');

	const redirectHosts = [
		...new Set(
			(client.redirect_uris ?? []).flatMap((uri: string) => {
				try {
					return [new URL(uri).host];
				} catch {
					return [];
				}
			})
		)
	];
	const requested = (url.searchParams.get('scope') ?? '').split(' ');
	const known = Object.entries(MCP_SCOPES).map(([id, description]) => ({ id, description }));
	const asked = known.filter((scope) => requested.includes(scope.id));
	return {
		client: { name: client.client_name ?? clientId, uri: client.client_uri ?? null, redirectHosts },
		scopes: asked.length > 0 ? asked : known
	};
};
