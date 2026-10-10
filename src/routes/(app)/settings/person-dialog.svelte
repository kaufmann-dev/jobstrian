<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import { personFormSchema } from '#lib/app-settings-schema.js';
	import { cn } from '#lib/utils.js';
	import { PERSON_COLOR_KEYS, personColor, personColorSchema } from '#lib/people.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import Check from '@lucide/svelte/icons/check';
	import Save from '@lucide/svelte/icons/save';
	import type { PageData } from './$types';

	let { data }: { data: PageData['personForm'] } = $props();

	let open = $state(false);
	let editing = $state(false);

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(personFormSchema),
			onUpdated: ({ form }) => {
				if (!form.valid) return;
				toast.success(typeof form.message === 'string' ? form.message : 'Person gespeichert.');
				open = false;
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, submitting } = form;

	/** Opens the dialog empty (`null`) or to edit the given person. */
	export function show(person: { id: number; name: string; color: string } | null) {
		editing = person !== null;
		form.reset({
			data: person
				? {
						id: person.id,
						name: person.name,
						color: personColorSchema.catch('amber').parse(person.color)
					}
				: { id: undefined, name: '', color: 'amber' }
		});
		open = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Person bearbeiten' : 'Person hinzufügen'}</Dialog.Title>
			<Dialog.Description>
				Jede Person hat eigene Stellen, Betriebe, Bewerbungen und einen eigenen Lebenslauf. Die
				Farbe hilft, Personen schnell zu unterscheiden.
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/savePerson" class="space-y-5" {@attach fromAction(enhance)}>
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
							placeholder="z. B. Anna Muster"
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Fieldset {form} name="color">
				<Form.Legend>Farbe</Form.Legend>
				<div class="flex flex-wrap gap-3 pt-1">
					{#each PERSON_COLOR_KEYS as key (key)}
						{@const color = personColor(key)}
						{@const selected = $formData.color === key}
						<Form.Control>
							{#snippet children({ props })}
								<input
									{...props}
									type="radio"
									class="peer sr-only"
									value={key}
									bind:group={$formData.color}
								/>
								<Form.Label
									title={color.label}
									class={cn(
										'size-9 cursor-pointer justify-center rounded-full ring-offset-2 ring-offset-popover transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
										color.dot,
										selected && 'ring-2 ring-foreground'
									)}
								>
									{#if selected}
										<Check class="size-4 text-white" aria-hidden="true" />
									{/if}
									<span class="sr-only">{color.label}</span>
								</Form.Label>
							{/snippet}
						</Form.Control>
					{/each}
				</div>
				<Form.FieldErrors />
			</Form.Fieldset>
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
