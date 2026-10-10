<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import { appSettingsFormSchema } from '#lib/app-settings-schema.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import type { PageData } from './$types';

	/** Select item value for "no default model"; Select values are strings, the form uses `null`. */
	const NO_DEFAULT = 'none';

	let {
		appSettingsForm,
		connections
	}: { appSettingsForm: PageData['appSettingsForm']; connections: PageData['connections'] } =
		$props();

	const form = superForm(
		untrack(() => appSettingsForm),
		{
			validators: zod4Client(appSettingsFormSchema),
			dataType: 'json',
			resetForm: false,
			onUpdated: ({ form }) => {
				if (form.valid)
					toast.success(typeof form.message === 'string' ? form.message : 'Gespeichert.');
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, submitting } = form;

	const hasModels = $derived(connections.some((connection) => connection.models.length > 0));
	const selectedLabel = $derived.by(() => {
		for (const connection of connections) {
			const model = connection.models.find((m) => m.id === $formData.defaultLlmModelId);
			if (model) return `${connection.name} · ${model.modelId}`;
		}
		return 'Kein Standard';
	});
</script>

<form method="POST" action="?/saveAppSettings" {@attach fromAction(enhance)}>
	<Card.Root>
		<Card.Header>
			<Card.Title>Standardwerte</Card.Title>
			<Card.Description>Einstellungen, die für alle Personen gelten.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-5">
			<Form.Field {form} name="defaultLlmModelId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Standard-KI-Modell</Form.Label>
						<Select.Root
							type="single"
							disabled={!hasModels}
							bind:value={
								() => String($formData.defaultLlmModelId ?? NO_DEFAULT),
								(value) =>
									($formData.defaultLlmModelId = value === NO_DEFAULT ? null : Number(value))
							}
						>
							<Select.Trigger {...props} class="w-full sm:max-w-md">{selectedLabel}</Select.Trigger>
							<Select.Content>
								<Select.Item value={NO_DEFAULT} label="Kein Standard" />
								{#each connections as connection (connection.id)}
									{#if connection.models.length > 0}
										<Select.Group>
											<Select.GroupHeading>{connection.name}</Select.GroupHeading>
											{#each connection.models as model (model.id)}
												<Select.Item
													value={String(model.id)}
													label={`${connection.name} · ${model.modelId}`}
												>
													{model.modelId}
												</Select.Item>
											{/each}
										</Select.Group>
									{/if}
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.Description>
					{#if hasModels}
						Dieses Modell nutzen alle Personen, die kein eigenes Modell gewählt haben.
					{:else}
						Lege zuerst eine KI-Verbindung mit mindestens einem Modell an.
					{/if}
				</Form.Description>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="ghostAfterDays">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Keine Antwort nach … Tagen</Form.Label>
						<Input
							{...props}
							type="number"
							min="1"
							max="365"
							class="sm:max-w-32"
							bind:value={$formData.ghostAfterDays}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description>
					Bewerbungen ohne jede Rückmeldung gelten danach als „Keine Antwort“ und stehen nicht mehr
					in der Übersicht der Rückmeldungen.
				</Form.Description>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="border-t">
			<Button type="submit" class="w-full sm:w-auto" disabled={$submitting}>
				{#if $submitting}<Spinner />{:else}<Save />{/if}
				Speichern
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
