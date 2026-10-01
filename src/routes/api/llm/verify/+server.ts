import { LlmHttpError, LlmNotConfiguredError } from '#lib/server/llm/client.js';
import { llmConfigStatus, verifyLlmConnection } from '#lib/server/llm/verify.js';
import type { RequestHandler } from './$types';

function verifyErrorMessage(err: unknown): string {
	if (err instanceof LlmNotConfiguredError) return err.message;
	if (err instanceof LlmHttpError && (err.status === 401 || err.status === 403)) {
		return 'API-Key ungültig oder nicht berechtigt.';
	}
	return 'KI-Verbindung fehlgeschlagen.';
}

export const POST: RequestHandler = async () => {
	try {
		const settings = await verifyLlmConnection();
		return Response.json({ status: llmConfigStatus(settings) });
	} catch (err) {
		console.error('[api/llm/verify] Prüfung fehlgeschlagen:', err);
		return Response.json({ message: verifyErrorMessage(err) }, { status: 400 });
	}
};
