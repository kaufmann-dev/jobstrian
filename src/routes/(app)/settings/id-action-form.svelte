<script lang="ts">
	import { applyAction, enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		/** A form action in `+page.server.ts` that only needs the identifier of one row. */
		action: 'deletePerson' | 'deleteConnection' | 'removeModel' | 'verifyModel' | 'revokeApp';
		id: number | string;
		/** Name of the hidden form field that carries `id`. */
		field?: 'id' | 'clientId';
		/** The form element, e.g. to submit it from a confirm dialog with `requestSubmit()`. */
		element?: HTMLFormElement | null;
		pending?: boolean;
		/** Called once the request finished; `ok` is true when the action succeeded. */
		ondone?: (ok: boolean) => void;
		children?: Snippet<[{ pending: boolean }]>;
	};

	let {
		action,
		id,
		field = 'id',
		element = $bindable(null),
		pending = $bindable(false),
		ondone,
		children
	}: Props = $props();

	/** The `message()` text Superforms attaches to the returned form, or a plain `{ message }`. */
	function messageOf(data: unknown): string | undefined {
		if (typeof data !== 'object' || data === null) return undefined;
		if ('form' in data && typeof data.form === 'object' && data.form !== null) {
			if ('message' in data.form && typeof data.form.message === 'string') return data.form.message;
		}
		return 'message' in data && typeof data.message === 'string' ? data.message : undefined;
	}

	function attachElement(node: HTMLFormElement) {
		element = node;
		return () => {
			if (element === node) element = null;
		};
	}

	const submit: SubmitFunction = () => {
		pending = true;
		return async ({ result }) => {
			pending = false;
			if (result.type === 'redirect') {
				await applyAction(result);
				return;
			}
			if (result.type === 'success') {
				toast.success(messageOf(result.data) ?? 'Gespeichert.');
				await invalidateAll();
				ondone?.(true);
				return;
			}
			const message = result.type === 'failure' ? messageOf(result.data) : result.error.message;
			toast.error(message || 'Die Aktion ist fehlgeschlagen.');
			ondone?.(false);
		};
	};

	function attachEnhance(node: HTMLFormElement) {
		const action = enhance(node, submit);
		return () => action.destroy();
	}
</script>

<form
	method="POST"
	action={`?/${action}`}
	class="contents"
	{@attach attachElement}
	{@attach attachEnhance}
>
	<input type="hidden" name={field} value={id} />
	{@render children?.({ pending })}
</form>
