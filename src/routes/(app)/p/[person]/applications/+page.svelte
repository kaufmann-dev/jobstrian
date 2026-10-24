<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		APPLICATION_BUCKETS,
		APPLICATION_BUCKET_LABELS,
		type ApplicationBucket,
		type ApplicationStatus
	} from '#lib/applications.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import PersonAvatar from '#lib/components/person-avatar.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import ApplicationDialog from './application-dialog.svelte';
	import {
		filterApplications,
		groupByBucket,
		statusFormValues,
		type ApplicationEvent,
		type ApplicationView
	} from './application-helpers.js';
	import ApplicationSheet from './application-sheet.svelte';
	import ApplicationsTable from './applications-table.svelte';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import SearchBar from './search-bar.svelte';
	import SearchDialog from './search-dialog.svelte';
	import { statusFormSchema } from './schema';
	import StatusDialog from './status-dialog.svelte';

	let { data } = $props();

	let tab = $state<ApplicationBucket>('responded');
	let query = $state('');
	let selectedId = $state<number | null>(null);
	let searchDialog = $state<'create' | 'edit' | null>(null);
	let applicationDialog = $state.raw<{
		application: ApplicationView | null;
		searchId?: number;
		target?: string;
		/** The new application lands in the search that is currently shown. */
		inShownSearch: boolean;
	} | null>(null);
	let statusTarget = $state.raw<{ application: ApplicationView; status: ApplicationStatus } | null>(
		null
	);

	const selectedSearch = $derived(
		data.searches.find((search) => search.id === data.selectedSearchId) ?? null
	);
	const runningSearch = $derived(data.searches.find((search) => search.status === 'searching'));
	const groups = $derived(groupByBucket(filterApplications(data.applications, query)));
	const interviews = $derived(
		data.applications.filter((application) => application.status === 'interview').length
	);
	const selectedApplication = $derived(
		selectedId === null
			? undefined
			: data.applications.find((application) => application.id === selectedId)
	);

	const emptyText = $derived<Record<ApplicationBucket, string>>({
		responded:
			'Noch keine Rückmeldung – das ist normal, viele Arbeitgeber antworten nicht. Bewerbungen ohne Antwort findest du unter „Wartet“ und „Keine Antwort“.',
		waiting: `Nichts im Wartezimmer. Neue Bewerbungen erscheinen hier, bis sie ${data.ghostAfterDays} Tage alt sind.`,
		ghosted: `Keine Bewerbung ohne Antwort. Nach ${data.ghostAfterDays} Tagen ohne Rückmeldung landen Bewerbungen hier.`,
		closed: 'Noch nichts abgeschlossen. Absagen und zurückgezogene Bewerbungen erscheinen hier.',
		planned: 'Nichts geplant. Hier liegen Bewerbungen, die du noch abschicken willst.'
	});

	// Marking a planned application as sent needs no questions, so it submits directly.
	const quickStatus = superForm(
		untrack(() => detachedForm(data.statusForm, 'status-inline', {})),
		{
			...actionFormOptions(),
			resetForm: false,
			validators: zod4Client(statusFormSchema)
		}
	);
	const quickStatusAttachment = fromAction(quickStatus.enhance);

	function eventsOf(applicationId: number): ApplicationEvent[] {
		return data.events[applicationId] ?? [];
	}

	function showRunningSearch() {
		void goto(resolve('/(app)/p/[person]/applications', { person: data.person.slug }), {
			reset: false
		});
	}

	function openCreate() {
		const inShownSearch = selectedSearch?.status === 'searching';
		applicationDialog = {
			application: null,
			searchId: inShownSearch ? selectedSearch.id : undefined,
			target: runningSearch
				? `Wird zu „${runningSearch.title}“ hinzugefügt.`
				: `Es startet automatisch die Suche „Jobsuche ${data.today.slice(0, 4)}“.`,
			inShownSearch
		};
	}

	function openEdit(application: ApplicationView) {
		applicationDialog = { application, inShownSearch: true };
	}

	function openStatus(application: ApplicationView, status: ApplicationStatus) {
		statusTarget = { application, status };
	}

	function markApplied(application: ApplicationView) {
		quickStatus.form.set(statusFormValues(application, 'applied', data.today));
		quickStatus.submit();
	}

	function applicationSaved() {
		// A new application of the running search is only visible once that search is shown.
		if (applicationDialog?.application === null && !applicationDialog.inShownSearch) {
			showRunningSearch();
		}
	}
</script>

<svelte:head>
	<title>Bewerbungen · Jobstrian</title>
</svelte:head>

<div class="space-y-5">
	<PageHeader title="Bewerbungen" description="Rückmeldungen und Stand deiner Bewerbungen">
		{#snippet status()}
			<span class="flex items-center gap-2 text-sm text-muted-foreground">
				<PersonAvatar person={data.person} size="sm" />
				{data.person.name}
			</span>
		{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>
				<Plus />
				Bewerbung hinzufügen
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.searches.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Briefcase /></Empty.Media>
				<Empty.Title>Noch keine Jobsuche</Empty.Title>
				<Empty.Description>
					Eine Jobsuche fasst deine Bewerbungen eines Zeitraums zusammen, zum Beispiel „Jobsuche
					{data.today.slice(0, 4)}“. Hier siehst du auf einen Blick, wer geantwortet hat.
					Bewerbungen ohne Antwort stören dabei nicht.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => (searchDialog = 'create')}>
					<Plus />
					Erste Suche starten
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<SearchBar
			person={data.person.slug}
			searches={data.searches}
			selected={selectedSearch}
			hasActiveSearch={data.hasActiveSearch}
			{interviews}
			statusForm={data.searchStatusForm}
			today={data.today}
			onnew={() => (searchDialog = 'create')}
			onedit={() => (searchDialog = 'edit')}
		/>

		<Tabs.Root value={tab} onValueChange={(value) => (tab = value as ApplicationBucket)}>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="max-w-full overflow-x-auto overflow-y-hidden">
					<Tabs.List>
						{#each APPLICATION_BUCKETS as bucket (bucket)}
							<Tabs.Trigger
								value={bucket}
								class={bucket === 'responded' ? 'font-semibold' : undefined}
							>
								{APPLICATION_BUCKET_LABELS[bucket]}
								<Badge
									variant={bucket === 'responded' && groups[bucket].length > 0
										? 'default'
										: 'secondary'}
									class="tabular-nums"
								>
									{groups[bucket].length}
								</Badge>
							</Tabs.Trigger>
						{/each}
					</Tabs.List>
				</div>
				<div class="relative w-full sm:w-72">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						bind:value={query}
						placeholder="Firma, Position oder Ort suchen"
						aria-label="Bewerbungen durchsuchen"
						class="pl-9"
					/>
				</div>
			</div>

			{#each APPLICATION_BUCKETS as bucket (bucket)}
				<Tabs.Content value={bucket} class="pt-2">
					{#if tab === bucket}
						{#if groups[bucket].length > 0}
							{#if bucket === 'waiting'}
								<p class="mb-2 text-xs text-muted-foreground">
									Seit höchstens {data.ghostAfterDays} Tagen beworben – es ist noch zu früh für eine Antwort.
								</p>
							{:else if bucket === 'ghosted'}
								<p class="mb-2 text-xs text-muted-foreground">
									Seit mehr als {data.ghostAfterDays} Tagen ohne Antwort. Das passiert vielen und sagt
									nichts über deine Bewerbung.
								</p>
							{/if}
							<ApplicationsTable
								variant={bucket}
								applications={groups[bucket]}
								today={data.today}
								onselect={(application) => (selectedId = application.id)}
								onstatus={openStatus}
								onmarkapplied={markApplied}
							/>
						{:else}
							<Empty.Root class="border p-8">
								<Empty.Header>
									<Empty.Description>
										{query.trim() && selectedSearch && selectedSearch.bucketCounts[bucket] > 0
											? `Keine Treffer für „${query.trim()}“ in dieser Ansicht.`
											: emptyText[bucket]}
									</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						{/if}
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{/if}
</div>

<form method="POST" action="?/setStatus" {@attach quickStatusAttachment} hidden></form>

{#if selectedApplication}
	{#key selectedApplication.id}
		<ApplicationSheet
			application={selectedApplication}
			events={eventsOf(selectedApplication.id)}
			noteForm={data.noteForm}
			today={data.today}
			onclose={() => (selectedId = null)}
			onedit={openEdit}
			onstatus={openStatus}
		/>
	{/key}
{/if}

{#if searchDialog}
	<SearchDialog
		form={data.searchForm}
		search={searchDialog === 'edit' ? selectedSearch : null}
		today={data.today}
		onclose={() => (searchDialog = null)}
		onsaved={() => {
			if (searchDialog === 'create') showRunningSearch();
		}}
	/>
{/if}

{#if applicationDialog}
	<ApplicationDialog
		form={data.applicationForm}
		application={applicationDialog.application}
		searchId={applicationDialog.searchId}
		target={applicationDialog.target}
		today={data.today}
		onclose={() => (applicationDialog = null)}
		onsaved={applicationSaved}
	/>
{/if}

{#if statusTarget}
	<StatusDialog
		form={data.statusForm}
		application={statusTarget.application}
		status={statusTarget.status}
		today={data.today}
		onclose={() => (statusTarget = null)}
	/>
{/if}
