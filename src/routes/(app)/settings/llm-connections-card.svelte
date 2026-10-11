<script lang="ts">
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import { LLM_API_LABELS } from '#lib/llm.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plug from '@lucide/svelte/icons/plug';
	import Plus from '@lucide/svelte/icons/plus';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import AddModelsDialog from './add-models-dialog.svelte';
	import ConnectionDialog from './connection-dialog.svelte';
	import IdActionForm from './id-action-form.svelte';
	import type { PageData } from './$types';

	type Connection = PageData['connections'][number];

	let {
		connections,
		connectionForm,
		addModelsForm
	}: {
		connections: Connection[];
		connectionForm: PageData['connectionForm'];
		addModelsForm: PageData['addModelsForm'];
	} = $props();

	let connectionDialog = $state<ReturnType<typeof ConnectionDialog>>();
	let addModelsDialog = $state<ReturnType<typeof AddModelsDialog>>();
	let confirmOpen = $state(false);
	let target = $state.raw<Connection | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	let deleting = $state(false);

	function askDelete(connection: Connection) {
		target = connection;
		confirmOpen = true;
	}

	function formatDate(value: Date): string {
		return new Date(value).toLocaleString('de-AT');
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="space-y-1.5">
				<Card.Title>KI-Verbindungen</Card.Title>
				<Card.Description>
					KI-Anbieter und ihre Modelle. Alle Personen können sie für das Bewerten und für
					Bewerbungsentwürfe nutzen.
				</Card.Description>
			</div>
			<Button size="sm" class="w-full sm:w-auto" onclick={() => connectionDialog?.show(null)}>
				<Plus /> Verbindung hinzufügen
			</Button>
		</div>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if connections.length === 0}
			<div
				class="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center"
			>
				<Plug class="size-8 text-muted-foreground" aria-hidden="true" />
				<p class="text-sm text-muted-foreground">
					Noch keine KI-Verbindung. Zum Bewerten von Stellen und Betrieben sowie für
					Bewerbungsentwürfe wird mindestens eine Verbindung mit einem gespeicherten Modell
					benötigt.
				</p>
			</div>
		{/if}
		{#each connections as connection (connection.id)}
			<section class="space-y-4 rounded-2xl border p-4" aria-label={connection.name}>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="font-medium">{connection.name}</h3>
							<Badge
								variant="outline"
								class="max-w-full"
								title={LLM_API_LABELS[connection.apiType]}
							>
								<span class="truncate">{LLM_API_LABELS[connection.apiType]}</span>
							</Badge>
							<Badge variant={connection.hasApiKey ? 'secondary' : 'outline'}>
								{connection.hasApiKey ? 'API-Key gespeichert' : 'Kein API-Key'}
							</Badge>
						</div>
						<p class="text-sm break-all text-muted-foreground">{connection.baseUrl}</p>
						<p class="text-xs text-muted-foreground">
							{connection.requestsPerMinute} Anfragen pro Minute · max. {connection.maxConcurrent} gleichzeitig
						</p>
					</div>
					<div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
						<Button
							variant="outline"
							size="sm"
							class="w-full sm:w-auto"
							onclick={() => connectionDialog?.show(connection)}
						>
							<Pencil /> Bearbeiten
						</Button>
						<Button
							variant="destructive"
							size="sm"
							class="w-full sm:w-auto"
							onclick={() => askDelete(connection)}
						>
							<Trash2 /> Löschen
						</Button>
					</div>
				</div>

				<div class="space-y-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h4 class="text-sm font-medium">Gespeicherte Modelle</h4>
						<Button variant="outline" size="sm" onclick={() => addModelsDialog?.show(connection)}>
							<Plus /> Modelle hinzufügen
						</Button>
					</div>
					{#if connection.models.length === 0}
						<p class="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
							Noch keine Modelle gespeichert. Füge mindestens ein Modell hinzu, damit diese
							Verbindung genutzt werden kann.
						</p>
					{:else}
						<ul class="divide-y rounded-xl border">
							{#each connection.models as model (model.id)}
								<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
									<span class="min-w-0 flex-1 font-mono text-xs break-all sm:text-sm">
										{model.modelId}
									</span>
									{#if model.verified}
										<Badge
											variant="outline"
											class="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
											title={model.verifiedAt
												? `Geprüft am ${formatDate(model.verifiedAt)}`
												: undefined}
										>
											<Check /> Geprüft
										</Badge>
									{:else}
										<Badge variant="secondary">Nicht geprüft</Badge>
									{/if}
									<div class="flex items-center gap-1">
										<IdActionForm action="verifyModel" id={model.id}>
											{#snippet children({ pending })}
												<Button type="submit" variant="outline" size="xs" disabled={pending}>
													{#if pending}<Spinner />{:else}<ShieldCheck />{/if}
													Prüfen
												</Button>
											{/snippet}
										</IdActionForm>
										<IdActionForm action="removeModel" id={model.id}>
											{#snippet children({ pending })}
												<Button
													type="submit"
													variant="ghost"
													size="icon-xs"
													disabled={pending}
													aria-label={`Modell ${model.modelId} entfernen`}
													title="Modell entfernen"
												>
													{#if pending}<Spinner />{:else}<X />{/if}
												</Button>
											{/snippet}
										</IdActionForm>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		{/each}
	</Card.Content>
</Card.Root>

<ConnectionDialog bind:this={connectionDialog} data={connectionForm} />
<AddModelsDialog bind:this={addModelsDialog} data={addModelsForm} {connections} />

{#if target}
	<IdActionForm
		action="deleteConnection"
		id={target.id}
		bind:element={deleteForm}
		bind:pending={deleting}
		ondone={(ok) => {
			if (ok) confirmOpen = false;
		}}
	/>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={target ? `Verbindung „${target.name}“ löschen?` : 'Verbindung löschen?'}
	actions={[
		{
			label: 'Löschen',
			variant: 'destructive',
			icon: Trash2,
			loading: deleting,
			onclick: () => deleteForm?.requestSubmit()
		}
	]}
>
	{#snippet description()}
		Die Verbindung und alle ihre gespeicherten Modelle werden entfernt. Personen, die eines dieser
		Modelle verwenden, nutzen danach wieder das Standard-KI-Modell der App.
	{/snippet}
</ConfirmDialog>
