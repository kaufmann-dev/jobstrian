import { json } from '@sveltejs/kit';
import { LlmHttpError, LlmNotConfiguredError } from '$lib/server/llm/client';
import { llmConfigStatus, verifyLlmConnection } from '$lib/server/llm/verify';
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
		return json({ status: llmConfigStatus(settings) });
	} catch (err) {
		console.error('[api/llm/verify] Prüfung fehlgeschlagen:', err);
		return json({ message: verifyErrorMessage(err) }, { status: 400 });
	}
};
