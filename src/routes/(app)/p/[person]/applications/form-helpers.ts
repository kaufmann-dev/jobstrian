import { toast } from 'svelte-sonner';

/**
 * Starting point of a short-lived form: the server-validated form from `load` with its own
 * id and start values. The distinct id keeps the form out of SvelteKit's page invalidation,
 * which would otherwise overwrite the start values whenever `load` runs again.
 */
export function detachedForm<F extends { id: string; data: object }>(
	form: F,
	id: string,
	data: Partial<F['data']>
): F {
	return { ...form, id, data: { ...form.data, ...data } };
}

/**
 * Shared superForm options of the action forms on this page: JSON payload, page data is
 * refreshed after a successful save, and the server message is shown as a toast.
 */
export function actionFormOptions(onsuccess?: () => void) {
	return {
		dataType: 'json',
		applyAction: false,
		invalidateAll: true,
		onUpdated: ({ form }: { form: { valid: boolean; message?: unknown } }) => {
			const message = typeof form.message === 'string' ? form.message : undefined;
			if (form.valid) {
				if (message) toast.success(message);
				onsuccess?.();
			} else if (message) {
				toast.error(message);
			}
		},
		onError: ({ result }: { result: { error: { message: string } } }) => {
			toast.error(result.error.message || 'Aktion fehlgeschlagen.');
		}
	} as const;
}
