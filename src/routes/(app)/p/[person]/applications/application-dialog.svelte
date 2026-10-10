<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import {
		APPLICATION_CHANNEL_LABELS,
		APPLICATION_CHANNELS,
		APPLICATION_STATUS_LABELS,
		APPLICATION_STATUSES,
		type ApplicationChannel,
		type ApplicationStatus
	} from '#lib/applications.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { PageData } from './$types';
	import { applicationFormValues, type ApplicationView } from './application-helpers.js';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import { applicationFormSchema } from './schema';

	interface Props {
		form: PageData['applicationForm'];
		/** The application to edit; `null` adds a new one. */
		application: ApplicationView | null;
		/** Search the new application belongs to; empty means the running search. */
		searchId?: number;
		/** Where a new application ends up, shown below the title. */
		target?: string;
		today: string;
		onclose: () => void;
		onsaved: () => void;
	}

	let { form: source, application, searchId, target, today, onclose, onsaved }: Props = $props();

	let open = $state(true);
	const editing = untrack(() => application !== null);

	const form = superForm(
		untrack(() =>
			detachedForm(
				source,
				'application-dialog',
				applicationFormValues(application, { searchId, today })
			)
		),
		{
			...actionFormOptions(() => {
				open = false;
				onsaved();
			}),
			resetForm: false,
			validators: zod4Client(applicationFormSchema)
		}
	);
	const { form: formData, enhance, submitting } = form;
	const enhanceAttachment = fromAction(enhance);

	/** A planned application has no application date yet. */
	function pickStatus(value: string) {
		const next = value as ApplicationStatus;
		$formData.status = next;
		if (next === 'planned') $formData.appliedOn = '';
		else if (!$formData.appliedOn) $formData.appliedOn = today;
	}
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclose()}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
		<form method="POST" action="?/saveApplication" {@attach enhanceAttachment} class="grid gap-5">
			<Dialog.Header>
				<Dialog.Title>{editing ? 'Bewerbung bearbeiten' : 'Bewerbung hinzufügen'}</Dialog.Title>
				<Dialog.Description>
					{#if editing}
						Der Status wird über „Status ändern“ gesetzt, damit er im Verlauf erscheint.
					{:else}
						{target ?? 'Halte fest, wo du dich beworben hast.'}
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="companyName">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Firma *</Form.Label>
							<Input {...props} bind:value={$formData.companyName} autocomplete="organization" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="positionTitle">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Position</Form.Label>
							<Input {...props} bind:value={$formData.positionTitle} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="url">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Link zur Stellenanzeige</Form.Label>
							<Input
								{...props}
								type="url"
								bind:value={$formData.url}
								placeholder="https://…"
								autocomplete="off"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="location">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Ort</Form.Label>
							<Input {...props} bind:value={$formData.location} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="contactName">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Kontaktperson</Form.Label>
							<Input {...props} bind:value={$formData.contactName} autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="contactEmail">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>E-Mail</Form.Label>
							<Input
								{...props}
								type="email"
								bind:value={$formData.contactEmail}
								autocomplete="off"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="contactPhone">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Telefon</Form.Label>
							<Input {...props} type="tel" bind:value={$formData.contactPhone} autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="channel">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Kanal</Form.Label>
							<Select.Root
								type="single"
								value={$formData.channel}
								onValueChange={(value) => ($formData.channel = value as ApplicationChannel)}
							>
								<Select.Trigger {...props} class="w-full">
									{APPLICATION_CHANNEL_LABELS[$formData.channel]}
								</Select.Trigger>
								<Select.Content>
									{#each APPLICATION_CHANNELS as channel (channel)}
										<Select.Item value={channel} label={APPLICATION_CHANNEL_LABELS[channel]} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				{#if !editing}
					<Form.Field {form} name="status">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Status</Form.Label>
								<Select.Root type="single" value={$formData.status} onValueChange={pickStatus}>
									<Select.Trigger {...props} class="w-full">
										{APPLICATION_STATUS_LABELS[$formData.status]}
									</Select.Trigger>
									<Select.Content>
										{#each APPLICATION_STATUSES as status (status)}
											<Select.Item value={status} label={APPLICATION_STATUS_LABELS[status]} />
										{/each}
									</Select.Content>
								</Select.Root>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				{/if}
				<Form.Field {form} name="appliedOn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Beworben am</Form.Label>
							<Input {...props} type="date" bind:value={$formData.appliedOn} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
				<Form.Field {form} name="nextStepOn">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Nächster Schritt am</Form.Label>
							<Input {...props} type="date" bind:value={$formData.nextStepOn} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="nextStepNote">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Nächster Schritt</Form.Label>
							<Input
								{...props}
								bind:value={$formData.nextStepNote}
								placeholder="z. B. Nachfassen, Unterlagen schicken"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

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
					{editing ? 'Speichern' : 'Hinzufügen'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
