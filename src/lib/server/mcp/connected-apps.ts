import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '../db/schema';

export interface ConnectedApp {
	clientId: string;
	name: string;
	uri: string | null;
	scopes: string[];
	grantedAt: Date;
}

/** MCP clients the owner has authorized. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
	const rows = await db
		.select({
			clientId: oauthConsent.clientId,
			name: oauthClient.name,
			uri: oauthClient.uri,
			scopes: oauthConsent.scopes,
			grantedAt: oauthConsent.updatedAt
		})
		.from(oauthConsent)
		.innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
		.where(eq(oauthConsent.userId, userId))
		.orderBy(asc(oauthClient.name));
	return rows.map((row) => ({ ...row, name: row.name ?? row.clientId }));
}

/**
 * Removes the consent and revokes refresh tokens, so the client must authorize again. Access
 * tokens are short-lived JWTs (15 minutes); stored ones are deleted, already-issued ones expire.
 */
export async function revokeConnectedApp(userId: string, clientId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const owned = (
			table: typeof oauthConsent | typeof oauthRefreshToken | typeof oauthAccessToken
		) => and(eq(table.userId, userId), eq(table.clientId, clientId));
		await tx.delete(oauthConsent).where(owned(oauthConsent));
		await tx
			.update(oauthRefreshToken)
			.set({ revoked: new Date() })
			.where(and(owned(oauthRefreshToken), isNull(oauthRefreshToken.revoked)));
		await tx.delete(oauthAccessToken).where(owned(oauthAccessToken));
	});
}
