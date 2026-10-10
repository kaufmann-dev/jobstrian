<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import {
		APPLICATION_BUCKET_LABELS,
		APPLICATION_CHANNEL_LABELS,
		APPLICATION_STATUS_LABELS,
		type ApplicationStatus
	} from '#lib/applications.js';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { PageData } from './$types';
	import {
		daysAgoLabel,
		daysSince,
		formatDate,
		isOverdue,
		sinceDaysLabel,
		type ApplicationEvent,
		type ApplicationView
	} from './application-helpers.js';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import { idFormSchema, noteFormSchema } from './schema';
	import StatusBadge from './status-badge.svelte';
	import StatusMenu from './status-menu.svelte';

	interface Props {
		application: ApplicationView;
		/** Timeline of the application, newest first. */
		events: ApplicationEvent[];
		noteForm: PageData['noteForm'];
		today: string;
		onclose: () => void;
		onedit: (application: ApplicationView) => void;
		onstatus: (application: ApplicationView, status: ApplicationStatus) => void;
	}

	let {
		application,
		events,
		noteForm: noteSource,
		today,
		onclose,
		onedit,
		onstatus
	}: Props = $props();

	let open = $state(true);
	let confirmDeleteOpen = $state(false);

	const note = superForm(
		untrack(() =>
			detachedForm(noteSource, 'sheet-note', { id: application.id, note: '', occurredOn: today })
		),
		{ ...actionFormOptions(), validators: zod4Client(noteFormSchema) }
	);
	const { form: noteData, enhance: noteEnhance, submitting: noteSubmitting } = note;
	const noteAttachment = fromAction(noteEnhance);

	const remove = superForm(
		untrack(() =>
			defaults({ id: application.id }, zod4Client(idFormSchema), { id: 'sheet-delete' })
		),
		{
			...actionFormOptions(() => (open = false)),
			resetForm: false,
			validators: zod4Client(idFormSchema)
		}
	);
	const { enhance: removeEnhance, submitting: removing } = remove;
	const removeAttachment = fromAction(removeEnhance);

	const overdue = $derived(isOverdue(application, today));
	const hasAdLink = $derived(/^https?:\/\//i.test(application.url));
</script>

<Sheet.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclose()}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-xl">
		<Sheet.Header class="pr-14">
			<Sheet.Title class="text-lg">{application.companyName}</Sheet.Title>
			<Sheet.Description>
				{application.positionTitle || 'Keine Position angegeben'}
			</Sheet.Description>
			<div class="flex flex-wrap items-center gap-2 pt-1">
				<StatusBadge status={application.status} />
				{#if application.bucket === 'ghosted'}
					<span class="text-xs text-muted-foreground">
						Keine Antwort {sinceDaysLabel(application.daysSinceApplied)}
					</span>
				{:else if application.bucket === 'waiting'}
					<span class="text-xs text-muted-foreground">
						{APPLICATION_BUCKET_LABELS.waiting} · {daysAgoLabel(application.daysSinceApplied)} beworben
					</span>
				{/if}
			</div>
		</Sheet.Header>

		<div class="space-y-6 px-6 pb-6">
			<div class="flex flex-wrap gap-2">
				<StatusMenu
					current={application.status}
					company={application.companyName}
					variant="default"
					onpick={(status) => onstatus(application, status)}
				/>
				<Button variant="outline" size="sm" onclick={() => onedit(application)}>
					<Pencil />
					Bearbeiten
				</Button>
				{#if hasAdLink}
					<Button variant="outline" size="sm" href={application.url} target="_blank">
						<ExternalLink />
						Stellenanzeige
					</Button>
				{/if}
			</div>

			<dl class="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-3 text-sm">
				<dt class="text-muted-foreground">Beworben am</dt>
				<dd>
					{formatDate(application.appliedOn)}
					{#if application.daysSinceApplied !== null}
						<span class="text-muted-foreground">· {daysAgoLabel(application.daysSinceApplied)}</span
						>
					{/if}
				</dd>

				<dt class="text-muted-foreground">Kanal</dt>
				<dd>{APPLICATION_CHANNEL_LABELS[application.channel]}</dd>

				<dt class="text-muted-foreground">Ort</dt>
				<dd>{application.location || '–'}</dd>

				<dt class="text-muted-foreground">Kontakt</dt>
				<dd class="flex flex-col items-start gap-1">
					{#if application.contactName || application.contactEmail || application.contactPhone}
						{#if application.contactName}<span>{application.contactName}</span>{/if}
						{#if application.contactEmail}
							<Button
								variant="link"
								class="h-auto p-0 font-normal"
								href={`mailto:${application.contactEmail}`}
							>
								{application.contactEmail}
							</Button>
						{/if}
						{#if application.contactPhone}
							<Button
								variant="link"
								class="h-auto p-0 font-normal"
								href={`tel:${application.contactPhone.replace(/[^\d+]/g, '')}`}
							>
								{application.contactPhone}
							</Button>
						{/if}
					{:else}
						–
					{/if}
				</dd>

				<dt class="text-muted-foreground">Nächster Schritt</dt>
				<dd class={overdue ? 'text-destructive' : undefined}>
					{#if application.nextStepOn || application.nextStepNote}
						{#if application.nextStepOn}
							<span class="font-medium tabular-nums">{formatDate(application.nextStepOn)}</span>
							{#if overdue}<span class="text-xs">· überfällig</span>{/if}
						{/if}
						{#if application.nextStepNote}
							<div class={overdue ? 'text-destructive/80' : 'text-muted-foreground'}>
								{application.nextStepNote}
							</div>
						{/if}
					{:else}
						–
					{/if}
				</dd>

				<dt class="text-muted-foreground">Notizen</dt>
				<dd class="whitespace-pre-wrap">{application.notes || '–'}</dd>
			</dl>

			<Separator />

			<section aria-labelledby="timeline-heading" class="space-y-3">
				<h3 id="timeline-heading" class="text-sm font-medium">Verlauf</h3>
				{#if events.length}
					<ol class="space-y-4 border-l pl-5">
						{#each events as event (event.id)}
							<li class="relative">
								<span
									class={[
										'absolute top-1.5 -left-[1.58rem] size-2.5 rounded-full border-2 border-background',
										event.kind === 'status' ? 'bg-primary' : 'bg-muted-foreground/60'
									]}
								></span>
								<div class="flex flex-wrap items-baseline gap-x-2">
									<span class="text-sm font-medium">
										{event.kind === 'note' || !event.status
											? 'Notiz'
											: APPLICATION_STATUS_LABELS[event.status]}
									</span>
									<span class="text-xs text-muted-foreground">
										{formatDate(event.occurredAt)} · {daysAgoLabel(
											daysSince(event.occurredAt, today)
										)}
									</span>
								</div>
								{#if event.note.trim()}
									<p class="text-sm whitespace-pre-wrap text-muted-foreground">{event.note}</p>
								{/if}
							</li>
						{/each}
					</ol>
				{:else}
					<p class="text-sm text-muted-foreground">Noch keine Einträge.</p>
				{/if}
			</section>

			<form method="POST" action="?/addNote" {@attach noteAttachment} class="space-y-3">
				<Form.Field form={note} name="note">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Notiz hinzufügen</Form.Label>
							<Textarea
								{...props}
								rows={3}
								bind:value={$noteData.note}
								placeholder="z. B. Telefonat mit Frau Huber, Rückruf nächste Woche"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<div class="flex flex-wrap items-end gap-3">
					<Form.Field form={note} name="occurredOn" class="min-w-40">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Datum</Form.Label>
								<Input {...props} type="date" bind:value={$noteData.occurredOn} />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Button type="submit" variant="outline" disabled={$noteSubmitting}>
						{#if $noteSubmitting}<Spinner />{:else}<Plus />{/if}
						Notiz hinzufügen
					</Button>
				</div>
			</form>

			<Separator />

			<div class="flex items-center justify-between gap-3">
				<p class="text-sm text-muted-foreground">Löscht die Bewerbung samt Verlauf.</p>
				<Button variant="destructive" size="sm" onclick={() => (confirmDeleteOpen = true)}>
					<Trash2 />
					Löschen
				</Button>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>

<form method="POST" action="?/deleteApplication" {@attach removeAttachment} hidden></form>

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Bewerbung löschen?"
	actions={[
		{
			label: 'Löschen',
			variant: 'destructive',
			icon: Trash2,
			loading: $removing,
			onclick: () => remove.submit()
		}
	]}
>
	{#snippet description()}
		„{application.companyName}“ wird samt Verlauf unwiderruflich gelöscht.
	{/snippet}
</ConfirmDialog>
