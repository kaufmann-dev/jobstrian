<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import ClipboardPlus from '@lucide/svelte/icons/clipboard-plus';

	type Props = {
		/** Slug of the person the application belongs to. */
		person: string;
		kind: 'listing' | 'lead';
		id: number;
		class?: string;
	};

	type CreateResponse = { application: { id: number; searchId: number }; existed: boolean };

	let { person, kind, id, class: className }: Props = $props();

	let loading = $state(false);

	async function create(): Promise<void> {
		loading = true;
		try {
			const response = await fetch(`/api/p/${person}/applications/from-${kind}/${id}`, {
				method: 'POST'
			});
			const body = (await response.json().catch(() => null)) as
				CreateResponse | { message?: string } | null;
			if (!response.ok || !body || !('application' in body)) {
				const message = body && 'message' in body ? body.message : undefined;
				toast.error(message ?? 'Bewerbung konnte nicht angelegt werden.');
				return;
			}
			const target = `${resolve('/(app)/p/[person]/applications', { person })}?search=${body.application.searchId}`;
			toast.success(body.existed ? 'Bewerbung ist bereits erfasst' : 'Bewerbung angelegt', {
				action: { label: 'Öffnen', onClick: () => void goto(target) }
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Bewerbung konnte nicht angelegt werden.'
			);
		} finally {
			loading = false;
		}
	}
</script>

<Button variant="outline" class={className} disabled={loading} onclick={create}>
	{#if loading}
		<Spinner class="size-4" />
	{:else}
		<ClipboardPlus class="size-4" />
	{/if}
	Bewerbung anlegen
</Button>
