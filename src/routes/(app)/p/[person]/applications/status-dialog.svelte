<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '#lib/applications.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Info from '@lucide/svelte/icons/info';
	import type { PageData } from './$types';
	import {
		STATUS_MENU_ORDER,
		isTerminalStatus,
		statusFormValues,
		type ApplicationView
	} from './application-helpers.js';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import { statusFormSchema } from './schema';

	interface Props {
		form: PageData['statusForm'];
		application: ApplicationView;
		/** Status the dialog starts with. */
		status: ApplicationStatus;
		today: string;
		onclose: () => void;
	}

	let { form: source, application, status, today, onclose }: Props = $props();

	let open = $state(true);

	const form = superForm(
		untrack(() =>
			detachedForm(source, 'status-dialog', statusFormValues(application, status, today))
		),
		{
			...actionFormOptions(() => (open = false)),
			resetForm: false,
			validators: zod4Client(statusFormSchema)
		}
	);
	const { form: formData, enhance, submitting } = form;
	const enhanceAttachment = fromAction(enhance);

	const showNextStep = $derived(!isTerminalStatus($formData.status));

	/** An application that ended has no next step; going back restores the current one. */
	function pickStatus(value: string) {
		const next = value as ApplicationStatus;
		const keep = !isTerminalStatus(next);
		$formData.status = next;
		$formData.nextStepOn = keep ? (application.nextStepOn ?? '') : '';
		$formData.nextStepNote = keep ? application.nextStepNote : '';
	}
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclose()}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-md">
		<form method="POST" action="?/setStatus" {@attach enhanceAttachment} class="grid gap-5">
			<Dialog.Header>
				<Dialog.Title>Status ändern</Dialog.Title>
				<Dialog.Description>
					{application.companyName}{application.positionTitle
						? ` · ${application.positionTitle}`
						: ''}
				</Dialog.Description>
			</Dialog.Header>

			<Form.Field {form} name="status">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Neuer Status</Form.Label>
						<Select.Root type="single" value={$formData.status} onValueChange={pickStatus}>
							<Select.Trigger {...props} class="w-full">
								{APPLICATION_STATUS_LABELS[$formData.status]}
							</Select.Trigger>
							<Select.Content>
								{#each STATUS_MENU_ORDER as option (option)}
									<Select.Item value={option} label={APPLICATION_STATUS_LABELS[option]} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if $formData.status === 'accepted'}
				<p class="flex items-start gap-2 rounded-xl border bg-primary/5 p-3 text-sm">
					<Info class="mt-0.5 size-4 shrink-0 text-primary" />
					Damit endet diese Suche.
				</p>
			{/if}

			<Form.Field {form} name="occurredOn">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Datum</Form.Label>
						<Input {...props} type="date" bind:value={$formData.occurredOn} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="note">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Notiz (optional)</Form.Label>
						<Textarea
							{...props}
							rows={3}
							bind:value={$formData.note}
							placeholder="z. B. Wer hat sich gemeldet, was wurde vereinbart?"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if showNextStep}
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
									placeholder="z. B. Gespräch vorbereiten"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
			{/if}

			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					Status speichern
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
