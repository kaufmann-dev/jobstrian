<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import ServerDataTable from '$lib/components/server-data-table.svelte';
	import RankFactors from '$lib/components/rank-factors.svelte';
	import { ServerListController } from '$lib/components/server-list-controller.svelte.js';
	import { renderSnippet } from '$lib/components/ui/data-table/render-helpers.js';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Star from '@lucide/svelte/icons/star';
	import type { Listing } from '$lib/server/db/schema';

	let { data } = $props();

	const SOURCE_LABELS: Record<string, string> = {
		willhaben: 'willhaben',
		karriere: 'karriere.at',
		hokify: 'hokify',
		ams: 'AMS'
	};

	const controller = new ServerListController<Listing>(
		'/api/listings',
		untrack(() => data.page),
		{ sort: 'recommended' }
	);
	let sourceFilter = $state('all');
	let verdictFilter = $state('all');
	let showClosed = $state(false);
	let selected = $state<Listing | null>(null);

	function resetFilters(): void {
		sourceFilter = 'all';
		verdictFilter = 'all';
		showClosed = false;
		selected = null;
	}

	/** Client-side mirror of the server's "recommended" order, for instant reordering on star. */
	function recommendedCompare(a: Listing, b: Listing): number {
		if (a.starred !== b.starred) return a.starred ? -1 : 1;
		if (a.rankScore !== b.rankScore) {
			if (a.rankScore == null) return 1;
			if (b.rankScore == null) return -1;
			return b.rankScore - a.rankScore;
		}
		const seenDiff = new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
		return seenDiff !== 0 ? seenDiff : b.id - a.id;
	}

	async function toggleStar(job: Listing): Promise<void> {
		const starred = !job.starred;
		controller.patch(
			(item) => item.id === job.id,
			(item) => ({ ...item, starred })
		);
		if (selected?.id === job.id) selected = { ...selected, starred };
		if (controller.sort === 'recommended') controller.reorder(recommendedCompare);
		const response = await fetch(`/api/listings/${job.id}/star`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ starred })
		});
		if (!response.ok) {
			controller.patch(
				(item) => item.id === job.id,
				(item) => ({ ...item, starred: !starred })
			);
			if (selected?.id === job.id) selected = { ...selected, starred: !starred };
			if (controller.sort === 'recommended') controller.reorder(recommendedCompare);
			toast.error('Markierung konnte nicht gespeichert werden.');
		}
	}

	function verdictClass(v: string | null): string {
		if (v === 'strong')
			return 'border-transparent bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300';
		if (v === 'maybe')
			return 'border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300';
		return 'border-transparent bg-muted text-muted-foreground';
	}

	function fmtDate(d: Date | string | null): string {
		if (!d) return '—';
		const date = new Date(d);
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return date.toLocaleDateString('de-AT', {
			day: '2-digit',
			month: '2-digit',
			...(sameYear ? {} : { year: '2-digit' })
		});
	}

	/** Normalize scraped locations like "Wien,Innere Stadt, Wien" → "Wien, Innere Stadt". */
	function fmtLocation(location: string | null): string {
		if (!location) return '—';
		const parts = location.split(',').map((part) => part.trim());
		return [...new Set(parts)].filter(Boolean).join(', ');
	}

	const columns: ColumnDef<Listing>[] = [
		{
			id: 'star',
			header: '',
			cell: ({ row }) => renderSnippet(starCell, { job: row.original }),
			meta: { class: 'w-10 px-1' }
		},
		{
			id: 'score',
			header: 'Score',
			cell: ({ row }) => renderSnippet(scoreCell, { job: row.original }),
			meta: {
				class: 'w-16',
				sort: { asc: 'score-asc', desc: 'score-desc', initial: 'desc' }
			}
		},
		{
			id: 'title',
			header: 'Stelle',
			cell: ({ row }) => renderSnippet(titleCell, { job: row.original }),
			meta: {
				class: 'w-auto whitespace-normal',
				sort: { asc: 'title-asc', desc: 'title-desc', initial: 'asc' }
			}
		},
		{
			id: 'company',
			header: 'Unternehmen',
			cell: ({ row }) => renderSnippet(companyCell, { job: row.original }),
			meta: {
				class: 'hidden w-48 whitespace-normal md:table-cell',
				sort: { asc: 'company-asc', desc: 'company-desc', initial: 'asc' }
			}
		},
		{
			id: 'location',
			header: 'Ort',
			cell: ({ row }) => renderSnippet(locationCell, { job: row.original }),
			meta: {
				class: 'hidden w-32 lg:table-cell',
				sort: { asc: 'location-asc', desc: 'location-desc', initial: 'asc' }
			}
		},
		{
			id: 'source',
			header: 'Portal',
			cell: ({ row }) => renderSnippet(sourceCell, { job: row.original }),
			meta: {
				class: 'hidden w-24 xl:table-cell',
				sort: { asc: 'source-asc', desc: 'source-desc', initial: 'asc' }
			}
		},
		{
			id: 'date',
			header: 'Datum',
			cell: ({ row }) => fmtDate(row.original.postedAt),
			meta: {
				class: 'hidden w-20 xl:table-cell',
				sort: { asc: 'posted-asc', desc: 'posted-desc', initial: 'desc' }
			}
		}
	];
</script>

<svelte:head>
	<title>Stellen · Jobstrian</title>
	<meta
		name="description"
		content="Durchsuche und filtere gefundene Stellenangebote, sortiert nach Empfehlung."
	/>
</svelte:head>

{#snippet starCell({ job }: { job: Listing })}
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={job.starred ? 'Markierung entfernen' : 'Stelle markieren'}
		onclick={(event) => {
			event.stopPropagation();
			toggleStar(job);
		}}
	>
		<Star class={['size-4', job.starred && 'fill-amber-400 text-amber-500']} />
	</Button>
{/snippet}

{#snippet scoreCell({ job }: { job: Listing })}
	{#if job.rankScore != null}
		<Badge class={['tabular-nums', verdictClass(job.rankVerdict)]}>{job.rankScore}</Badge>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet titleCell({ job }: { job: Listing })}
	<div
		class={[
			'max-w-md font-medium break-words whitespace-normal',
			job.status === 'closed' && 'opacity-50'
		]}
	>
		{job.title}
	</div>
{/snippet}

{#snippet companyCell({ job }: { job: Listing })}
	<div class="max-w-64 break-words whitespace-normal">{job.company ?? '—'}</div>
{/snippet}

{#snippet locationCell({ job }: { job: Listing })}
	<div class="truncate" title={fmtLocation(job.location)}>{fmtLocation(job.location)}</div>
{/snippet}

{#snippet sourceCell({ job }: { job: Listing })}
	<div class="truncate">{SOURCE_LABELS[job.source] ?? job.source}</div>
{/snippet}

<div class="space-y-5">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Stellen</h1>
		<p class="text-sm text-muted-foreground">
			Automatisch gesammelte Inserate, von der KI nach deinem Profil bewertet.
		</p>
	</div>

	{#snippet filters()}
		<div class="min-w-0">
			<Select.Root
				type="single"
				value={sourceFilter}
				onValueChange={(value) => {
					if (!value) return;
					sourceFilter = value;
					void controller.reset({ source: value === 'all' ? null : value });
					selected = null;
				}}
			>
				<Select.Trigger aria-label="Portal" class="min-h-10 w-full lg:min-h-8 lg:w-fit"
					>{sourceFilter === 'all' ? 'Alle Portale' : SOURCE_LABELS[sourceFilter]}</Select.Trigger
				>
				<Select.Content>
					<Select.Item value="all">Alle Portale</Select.Item>
					{#each Object.entries(SOURCE_LABELS) as [id, label] (id)}
						<Select.Item value={id}>{label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="min-w-0">
			<Select.Root
				type="single"
				value={verdictFilter}
				onValueChange={(value) => {
					if (!value) return;
					verdictFilter = value;
					void controller.reset({ verdict: value === 'all' ? null : value });
					selected = null;
				}}
			>
				<Select.Trigger aria-label="Bewertung" class="min-h-10 w-full lg:min-h-8 lg:w-fit">
					{{ all: 'Alle Bewertungen', strong: 'Passt gut', maybe: 'Vielleicht', weak: 'Schwach' }[
						verdictFilter
					]}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="all">Alle Bewertungen</Select.Item>
					<Select.Item value="strong">Passt gut</Select.Item>
					<Select.Item value="maybe">Vielleicht</Select.Item>
					<Select.Item value="weak">Schwach</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<label
			class="flex min-h-10 items-center gap-2 rounded-2xl bg-input/35 px-3 text-sm lg:min-h-8"
		>
			<Checkbox
				checked={showClosed}
				onCheckedChange={(checked) => {
					showClosed = checked;
					void controller.reset({ showClosed: checked ? 'true' : null });
					selected = null;
				}}
			/>
			Geschlossene zeigen
		</label>
	{/snippet}

	<ServerDataTable
		{controller}
		{columns}
		{filters}
		onRowClick={(job) => (selected = job)}
		onResetFilters={resetFilters}
		searchPlaceholder="Stelle, Unternehmen oder Ort suchen"
		defaultSort="recommended"
		itemLabel="Stellen"
		emptyText="Keine Stellen. Klicke auf „Aktualisieren“ in der Übersicht."
	/>
</div>

<Sheet.Root open={selected !== null} onOpenChange={(open) => !open && (selected = null)}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-lg">
		{#if selected}
			<Sheet.Header>
				<Sheet.Title>{selected.title}</Sheet.Title>
				<Sheet.Description>
					{selected.company ?? 'Unbekanntes Unternehmen'} · {fmtLocation(
						selected.location ?? 'unbekannt'
					)}
				</Sheet.Description>
			</Sheet.Header>
			<div class="space-y-4 px-4 pb-4">
				<div class="flex flex-wrap items-center gap-2">
					{#if selected.rankScore != null}
						<Badge class={verdictClass(selected.rankVerdict)}>Score {selected.rankScore}</Badge>
					{/if}
					<Badge variant="outline">{SOURCE_LABELS[selected.source] ?? selected.source}</Badge>
					{#if selected.postedAt}<Badge variant="outline">{fmtDate(selected.postedAt)}</Badge>{/if}
					{#if selected.salary}<Badge variant="outline">{selected.salary}</Badge>{/if}
					{#if selected.status === 'closed'}<Badge variant="destructive">geschlossen</Badge>{/if}
				</div>
				{#if selected.rankFactors?.length}
					<RankFactors factors={selected.rankFactors} />
				{:else if selected.rankReason}
					<div>
						<h3 class="mb-1 text-sm font-medium">Bewertung</h3>
						<p class="text-sm text-muted-foreground">{selected.rankReason}</p>
					</div>
				{/if}
				{#if selected.description}
					<div>
						<h3 class="mb-1 text-sm font-medium">Beschreibung</h3>
						<p class="text-sm whitespace-pre-line text-muted-foreground">{selected.description}</p>
					</div>
				{/if}
				<Button href={selected.url} target="_blank" class="w-full">
					<ExternalLink class="size-4" />
					Stelle öffnen
				</Button>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
