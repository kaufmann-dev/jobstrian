<script lang="ts">
	import { applyAction, enhance as kitEnhance, type SubmitFunction } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import { addModelsFormSchema } from '#lib/app-settings-schema.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import CloudDownload from '@lucide/svelte/icons/cloud-download';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageData } from './$types';

	/** Rendering hundreds of checkboxes makes typing in the search slow; narrow the search instead. */
	const VISIBLE_LIMIT = 100;

	let {
		data,
		connections
	}: { data: PageData['addModelsForm']; connections: PageData['connections'] } = $props();

	let open = $state(false);
	let connectionId = $state(0);
	let available = $state.raw<string[] | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let search = $state('');
	let manualId = $state('');

	const connection = $derived(connections.find((c) => c.id === connectionId));
	const savedIds = $derived(new Set(connection?.models.map((model) => model.modelId)));
	const matches = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return (available ?? []).filter(
			(id) => !savedIds.has(id) && (!query || id.toLowerCase().includes(query))
		);
	});
	const visible = $derived(matches.slice(0, VISIBLE_LIMIT));

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(addModelsFormSchema),
			dataType: 'json',
			onUpdated: ({ form }) => {
				if (!form.valid) return;
				toast.success(typeof form.message === 'string' ? form.message : 'Modelle gespeichert.');
				open = false;
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, submitting } = form;

	/** Opens the dialog to add models to the given connection. */
	export function show(target: { id: number }) {
		connectionId = target.id;
		available = null;
		loadError = null;
		search = '';
		manualId = '';
		form.reset({ data: { connectionId: target.id, modelIds: [] } });
		open = true;
	}

	const loadModels: SubmitFunction = () => {
		loading = true;
		loadError = null;
		return async ({ result }) => {
			loading = false;
			if (result.type === 'success') {
				const models: unknown = result.data?.models;
				available = Array.isArray(models)
					? models.filter((id): id is string => typeof id === 'string')
					: [];
			} else if (result.type === 'failure') {
				const error: unknown = result.data?.error;
				loadError =
					typeof error === 'string' ? error : 'Die Modellliste konnte nicht geladen werden.';
			} else if (result.type === 'error') {
				loadError = result.error.message || 'Die Modellliste konnte nicht geladen werden.';
			} else {
				await applyAction(result);
			}
		};
	};

	function attachLoadModels(node: HTMLFormElement) {
		const action = kitEnhance(node, loadModels);
		return () => action.destroy();
	}

	function toggle(id: string, checked: boolean) {
		const rest = $formData.modelIds.filter((selected) => selected !== id);
		$formData.modelIds = checked ? [...rest, id] : rest;
	}

	function addManual() {
		const id = manualId.trim();
		if (!id || $submitting) return;
		$formData.modelIds = [id];
		form.submit();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Modelle hinzufügen</Dialog.Title>
			<Dialog.Description>
				Verbindung „{connection?.name ?? ''}“: Lade die Modellliste vom Anbieter oder gib einen
				Modellnamen manuell ein.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3">
			<form method="POST" action="?/loadModels" {@attach attachLoadModels}>
				<input type="hidden" name="connectionId" value={connectionId} />
				<Button type="submit" variant="outline" class="w-full sm:w-auto" disabled={loading}>
					{#if loading}<Spinner />{:else}<CloudDownload />{/if}
					{available ? 'Modellliste neu laden' : 'Modelle vom Anbieter laden'}
				</Button>
			</form>
			{#if loadError}
				<p class="text-sm text-destructive" role="alert">
					{loadError}
					<span class="text-muted-foreground"
						>Du kannst den Modellnamen unten manuell eingeben.</span
					>
				</p>
			{/if}
		</div>

		<form method="POST" action="?/addModels" class="space-y-5" {@attach fromAction(enhance)}>
			{#if available}
				<div class="space-y-3">
					<Input
						type="search"
						bind:value={search}
						placeholder="Modelle durchsuchen …"
						aria-label="Modelle durchsuchen"
						autocomplete="off"
						onkeydown={(event) => {
							if (event.key === 'Enter') event.preventDefault();
						}}
					/>
					<Form.Fieldset {form} name="modelIds">
						<Form.Legend class="sr-only">Modelle zum Hinzufügen</Form.Legend>
						{#if matches.length === 0}
							<p class="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
								{available.length === 0
									? 'Der Anbieter hat keine Modelle gemeldet.'
									: 'Keine weiteren Modelle gefunden.'}
							</p>
						{:else}
							<div class="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border p-1">
								{#each visible as id (id)}
									<Form.Control>
										{#snippet children({ props })}
											<div
												class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50"
											>
												<Checkbox
													{...props}
													value={id}
													bind:checked={
														() => $formData.modelIds.includes(id), (checked) => toggle(id, checked)
													}
												/>
												<Form.Label
													class="min-w-0 flex-1 cursor-pointer font-mono text-xs leading-snug font-normal break-all"
												>
													{id}
												</Form.Label>
											</div>
										{/snippet}
									</Form.Control>
								{/each}
							</div>
							{#if matches.length > visible.length}
								<p class="text-xs text-muted-foreground">
									{matches.length - visible.length} weitere Treffer – grenze die Suche ein.
								</p>
							{/if}
						{/if}
						<Form.FieldErrors />
					</Form.Fieldset>
					<Button
						type="submit"
						class="w-full sm:w-auto"
						disabled={$submitting || $formData.modelIds.length === 0}
					>
						{#if $submitting}<Spinner />{:else}<Plus />{/if}
						{$formData.modelIds.length === 1
							? '1 Modell hinzufügen'
							: `${$formData.modelIds.length} Modelle hinzufügen`}
					</Button>
				</div>
			{/if}

			<Form.Field {form} name="modelIds" class="border-t pt-4">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Modellname manuell hinzufügen</Form.Label>
						<div class="flex gap-2">
							<Input
								{...props}
								name={undefined}
								bind:value={manualId}
								placeholder="z. B. gpt-4o-mini"
								autocomplete="off"
								onkeydown={(event) => {
									if (event.key !== 'Enter') return;
									event.preventDefault();
									addManual();
								}}
							/>
							<Button
								type="button"
								variant="outline"
								disabled={$submitting || manualId.trim() === ''}
								onclick={addManual}
							>
								<Plus /> Hinzufügen
							</Button>
						</div>
					{/snippet}
				</Form.Control>
				{#if !available}
					<Form.FieldErrors />
				{/if}
			</Form.Field>
		</form>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Schließen</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
