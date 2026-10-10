<script lang="ts">
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { fromAction } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { personFormSchema } from '#lib/app-settings-schema.js';
	import { PERSON_COLORS, PERSON_COLOR_KEYS, type PersonColor } from '#lib/people.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import PersonAvatar from '#lib/components/person-avatar.svelte';
	import TrackerSummary from '#lib/components/tracker-summary.svelte';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';

	let { data } = $props();

	// Posts to the savePerson action of the app settings; the reload then replaces the empty state.
	const form = superForm(defaults(zod4(personFormSchema)), {
		id: 'person',
		validators: zod4Client(personFormSchema),
		onUpdated: ({ form: updated }) => {
			if (updated.valid && typeof updated.message === 'string') toast.success(updated.message);
		}
	});
	const { form: formData, enhance, submitting } = form;
	const enhanceAttachment = fromAction(enhance);

	const quickLinks = [
		{ section: 'jobs', label: 'Stellen', icon: Briefcase },
		{ section: 'leads', label: 'Betriebe', icon: MapPin },
		{ section: 'applications', label: 'Bewerbungen', icon: ClipboardList }
	] as const;
</script>

<svelte:head>
	<title>Alle Personen · Jobstrian</title>
	<meta
		name="description"
		content="Alle Personen auf einen Blick: Rückmeldungen und nächste Schritte der laufenden Bewerbungssuchen."
	/>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Alle Personen"
		description="Rückmeldungen und nächste Schritte der laufenden Suchen auf einen Blick."
	>
		{#snippet actions()}
			{#if data.overviews.length > 0}
				<Button href="/settings" variant="outline">
					<Users class="size-4" />
					Personen verwalten
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.overviews.length === 0}
		<Card.Root class="mx-auto w-full max-w-md">
			<Card.Header>
				<Card.Title class="text-lg">Lege die erste Person an</Card.Title>
				<Card.Description>
					Jede Person hat eigene Stellen, Betriebe, Bewerbungen und Einstellungen. Weitere Personen
					kannst du später in den App-Einstellungen anlegen.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="{resolve('settings')}?/savePerson"
					{@attach enhanceAttachment}
					class="space-y-4"
				>
					<Form.Field {form} name="name">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Name</Form.Label>
								<Input
									{...props}
									bind:value={$formData.name}
									autocomplete="off"
									placeholder="z. B. Anna"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Fieldset {form} name="color">
						<Form.Legend>Farbe</Form.Legend>
						<RadioGroup.Root
							name="color"
							class="flex flex-wrap gap-3"
							bind:value={
								() => $formData.color, (value) => ($formData.color = value as PersonColor)
							}
						>
							{#each PERSON_COLOR_KEYS as key (key)}
								<Form.Control>
									{#snippet children({ props })}
										<span
											class={[
												'relative inline-flex size-7 rounded-full ring-offset-2 ring-offset-card has-data-[checked]:ring-2 has-data-[checked]:ring-foreground/70',
												PERSON_COLORS[key].dot
											]}
										>
											<RadioGroup.Item
												{...props}
												value={key}
												aria-label={PERSON_COLORS[key].label}
												title={PERSON_COLORS[key].label}
												class="size-7 rounded-full bg-transparent data-checked:bg-transparent dark:data-checked:bg-transparent"
											/>
										</span>
									{/snippet}
								</Form.Control>
							{/each}
						</RadioGroup.Root>
						<Form.FieldErrors />
					</Form.Fieldset>
					<Form.Button class="w-full" disabled={$submitting}>
						{#if $submitting}
							<Spinner class="size-4" />
						{:else}
							<Plus class="size-4" />
						{/if}
						Person anlegen
					</Form.Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.overviews as overview (overview.person.id)}
				<Card.Root>
					<Card.Header>
						<a
							href={resolve('/(app)/p/[person]', { person: overview.person.slug })}
							class="group/person flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<PersonAvatar person={overview.person} size="lg" />
							<span class="min-w-0">
								<span class="block truncate text-base font-semibold group-hover/person:underline">
									{overview.person.name}
								</span>
								<span class="block text-xs text-muted-foreground">Zur Übersicht</span>
							</span>
						</a>
					</Card.Header>
					<Card.Content class="flex-1">
						<TrackerSummary {overview} />
					</Card.Content>
					<Card.Footer class="flex-wrap gap-2 border-t">
						{#each quickLinks as link (link.section)}
							<Button
								href={`/p/${overview.person.slug}/${link.section}`}
								variant="outline"
								size="sm"
							>
								<link.icon class="size-4" />
								{link.label}
							</Button>
						{/each}
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
