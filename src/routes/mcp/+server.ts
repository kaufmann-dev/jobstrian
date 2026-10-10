import { createMcpHandler } from '@modelcontextprotocol/server';
import { requireMcpAuth } from '@better-auth/mcp';
import type { RequestHandler } from './$types';
import { auth, MCP_RESOURCE } from '#lib/server/auth.js';
import { MCP_SCOPES, TOOL_SCOPES } from '#lib/server/mcp/scopes.js';
import { createMcpServer } from '#lib/server/mcp/tools.js';

/**
 * Serves the 2026-07-28 protocol and, statelessly, 2025-era clients from one tool definition.
 * Each request builds a server exposing only the tools the token's scopes permit.
 */
const mcpHandler = createMcpHandler(({ authInfo }) => createMcpServer(new Set(authInfo?.scopes)));

type AccessTokenClaims = Parameters<Parameters<typeof requireMcpAuth>[1]>[1];

function serve(request: Request, claims: AccessTokenClaims): Promise<Response> {
	const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
	const clientId = typeof claims.azp === 'string' ? claims.azp : String(claims.client_id ?? '');
	return mcpHandler.fetch(request, {
		authInfo: {
			token: request.headers.get('authorization')?.replace(/^\S+\s+/, '') ?? '',
			clientId,
			scopes,
			expiresAt: claims.exp,
			resource: new URL(MCP_RESOURCE),
			extra: { userId: claims.sub }
		}
	});
}

/** Scopes advertised in challenges, so clients request tool access and a refresh token at once. */
const CHALLENGE_SCOPES = [...Object.keys(MCP_SCOPES), 'offline_access'];

// One verifier per required-scope set; each caches the authorization server's JWKS.
const guards = new Map<string, (request: Request) => Promise<Response>>();
function guardFor(requiredScopes: string[]) {
	const key = requiredScopes.join(' ');
	let guard = guards.get(key);
	if (!guard) {
		// Created on first use: `auth` exists only after the server init hook has run.
		guard = requireMcpAuth(auth, serve, {
			resource: MCP_RESOURCE,
			requiredScopes,
			challengeScopes: CHALLENGE_SCOPES
		});
		guards.set(key, guard);
	}
	return guard;
}

/** Scopes needed by the tool calls in a JSON-RPC message or batch. */
function requiredScopes(body: unknown): string[] {
	const messages = Array.isArray(body) ? body : [body];
	const scopes = new Set<string>();
	for (const message of messages) {
		if (message?.method !== 'tools/call') continue;
		const scope = (TOOL_SCOPES as Record<string, string>)[String(message.params?.name)];
		if (scope) scopes.add(scope);
	}
	return [...scopes].sort();
}

/**
 * Tokens are verified before any tool runs: missing or invalid tokens get a 401 pointing at the
 * protected resource metadata; tokens lacking a tool's scope get a 403 `insufficient_scope`
 * challenge so the client can step up.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request
		.clone()
		.json()
		.catch(() => null);
	return guardFor(requiredScopes(body))(request);
};

const methodNotAllowed: RequestHandler = () =>
	new Response(null, { status: 405, headers: { Allow: 'POST' } });
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
