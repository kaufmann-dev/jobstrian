<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import { connectionFormSchema } from '#lib/app-settings-schema.js';
	import { LLM_API_TYPES, LLM_API_LABELS, LLM_BASE_URLS } from '#lib/llm.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import type { PageData } from './$types';

	type Connection = PageData['connections'][number];

	let { data }: { data: PageData['connectionForm'] } = $props();

	let open = $state(false);
	let editing = $state(false);
	let hasStoredKey = $state(false);

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(connectionFormSchema),
			onUpdated: ({ form }) => {
				if (!form.valid) return;
				toast.success(typeof form.message === 'string' ? form.message : 'Verbindung gespeichert.');
				open = false;
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, submitting } = form;

	function selectApiType(value: string) {
		const apiType = LLM_API_TYPES.find((candidate) => candidate === value);
		if (!apiType) return;
		const currentUrl = $formData.baseUrl.trim().replace(/\/+$/, '');
		const useDefaultUrl = !currentUrl || currentUrl === LLM_BASE_URLS[$formData.apiType];
		$formData.apiType = apiType;
		if (useDefaultUrl) $formData.baseUrl = LLM_BASE_URLS[apiType];
	}

	/** Opens the dialog empty (`null`) or to edit the given connection. */
	export function show(connection: Connection | null) {
		editing = connection !== null;
		hasStoredKey = connection?.hasApiKey ?? false;
		form.reset({
			data: connection
				? {
						id: connection.id,
						name: connection.name,
						apiType: connection.apiType,
						baseUrl: connection.baseUrl,
						apiKey: '',
						requestsPerMinute: connection.requestsPerMinute,
						maxConcurrent: connection.maxConcurrent
					}
				: {
						id: undefined,
						name: '',
						apiType: 'openai',
						baseUrl: LLM_BASE_URLS.openai,
						apiKey: '',
						requestsPerMinute: 300,
						maxConcurrent: 50
					}
		});
		open = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Verbindung bearbeiten' : 'Verbindung hinzufügen'}</Dialog.Title>
			<Dialog.Description>Ein KI-Anbieter, den alle Personen nutzen können.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/saveConnection" class="space-y-4" {@attach fromAction(enhance)}>
			{#if $formData.id}
				<input type="hidden" name="id" value={$formData.id} />
			{/if}
			<Form.Field {form} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Name</Form.Label>
						<Input
							{...props}
							bind:value={$formData.name}
							placeholder="z. B. OpenAI"
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="apiType">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>API-Typ</Form.Label>
						<Select.Root
							type="single"
							name={props.name}
							value={$formData.apiType}
							onValueChange={selectApiType}
						>
							<Select.Trigger {...props} class="w-full">
								<span class="truncate">{LLM_API_LABELS[$formData.apiType]}</span>
							</Select.Trigger>
							<Select.Content>
								{#each LLM_API_TYPES as apiType (apiType)}
									<Select.Item value={apiType} label={LLM_API_LABELS[apiType]} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="baseUrl">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Base URL</Form.Label>
						<Input
							{...props}
							inputmode="url"
							bind:value={$formData.baseUrl}
							placeholder={LLM_BASE_URLS[$formData.apiType] || 'https://api.example.com/v1'}
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="apiKey">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>API-Key</Form.Label>
						<Input
							{...props}
							type="password"
							bind:value={$formData.apiKey}
							placeholder={editing && hasStoredKey
								? 'Leer lassen, um den gespeicherten Key zu behalten'
								: 'sk-…'}
							autocomplete="new-password"
						/>
					{/snippet}
				</Form.Control>
				<Form.Description
					>Der Key wird nur auf dem Server gespeichert und nie angezeigt.</Form.Description
				>
				<Form.FieldErrors />
			</Form.Field>
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="requestsPerMinute">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Anfragen pro Minute</Form.Label>
							<Input
								{...props}
								type="number"
								min="1"
								max="10000"
								bind:value={$formData.requestsPerMinute}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="maxConcurrent">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Maximal gleichzeitig aktiv</Form.Label>
							<Input
								{...props}
								type="number"
								min="1"
								max="200"
								bind:value={$formData.maxConcurrent}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{:else}<Save />{/if}
					Speichern
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
