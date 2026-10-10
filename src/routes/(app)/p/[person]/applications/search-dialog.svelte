<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { PageData } from './$types';
	import { searchFormValues, type SearchView } from './application-helpers.js';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import { searchFormSchema } from './schema';

	interface Props {
		form: PageData['searchForm'];
		/** The search to edit; `null` starts a new one. */
		search: SearchView | null;
		today: string;
		onclose: () => void;
		onsaved: () => void;
	}

	let { form: source, search, today, onclose, onsaved }: Props = $props();

	let open = $state(true);
	const editing = untrack(() => search !== null);

	const form = superForm(
		untrack(() => detachedForm(source, 'search-dialog', searchFormValues(search, today))),
		{
			...actionFormOptions(() => {
				open = false;
				onsaved();
			}),
			resetForm: false,
			validators: zod4Client(searchFormSchema)
		}
	);
	const { form: formData, enhance, submitting } = form;
	const enhanceAttachment = fromAction(enhance);
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclose()}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<form method="POST" action="?/saveSearch" {@attach enhanceAttachment} class="grid gap-5">
			<Dialog.Header>
				<Dialog.Title>{editing ? 'Suche bearbeiten' : 'Neue Suche starten'}</Dialog.Title>
				<Dialog.Description>
					{#if editing}
						Titel, Ziel und Notizen dieser Jobsuche.
					{:else}
						Jede Jobsuche ist ein eigener Abschnitt, zum Beispiel „Jobsuche 2026“. Sobald du eine
						Zusage annimmst, endet sie automatisch.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<Form.Field {form} name="title">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Titel *</Form.Label>
						<Input {...props} bind:value={$formData.title} autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="goal">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Ziel</Form.Label>
						<Input
							{...props}
							bind:value={$formData.goal}
							placeholder="z. B. Vollzeitstelle im Büro in Wien"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if !editing}
				<Form.Field {form} name="startedOn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Beginn</Form.Label>
							<Input {...props} type="date" bind:value={$formData.startedOn} class="sm:max-w-48" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			{/if}

			<Form.Field {form} name="notes">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Notizen</Form.Label>
						<Textarea {...props} rows={3} bind:value={$formData.notes} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{editing ? 'Speichern' : 'Suche starten'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
