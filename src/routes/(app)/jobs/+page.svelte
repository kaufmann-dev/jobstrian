<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import InfiniteDataTable from '$lib/components/infinite-data-table.svelte';
	import { InfiniteListController } from '$lib/components/infinite-list-controller.svelte.js';
	import { renderSnippet } from '$lib/components/ui/data-table/render-helpers.js';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Star from '@lucide/svelte/icons/star';
	import Eye from '@lucide/svelte/icons/eye';
	import type { Listing } from '$lib/server/db/schema';

	let { data } = $props();

	const SOURCE_LABELS: Record<string, string> = {
		willhaben: 'willhaben',
		karriere: 'karriere.at',
		hokify: 'hokify',
		ams: 'AMS'
	};

	const controller = new InfiniteListController<Listing>(
		'/api/listings',
		untrack(() => data.page)
	);
	let sourceFilter = $state('all');
	let verdictFilter = $state('all');
	let showClosed = $state(false);
	let selected = $state<Listing | null>(null);

	function query(): string {
		const params = new URLSearchParams();
		if (sourceFilter !== 'all') params.set('source', sourceFilter);
		if (verdictFilter !== 'all') params.set('verdict', verdictFilter);
		if (showClosed) params.set('showClosed', 'true');
		return params.toString();
	}

	function reset(): void {
		void controller.reset(query());
		selected = null;
	}

	async function toggleStar(job: Listing): Promise<void> {
		const response = await fetch(`/api/listings/${job.id}/star`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ starred: !job.starred })
		});
		if (!response.ok) {
			toast.error('Markierung konnte nicht gespeichert werden.');
			return;
		}
		await controller.reset(query());
	}

	function verdictVariant(v: string | null): 'default' | 'secondary' | 'outline' {
		return v === 'strong' ? 'default' : v === 'maybe' ? 'secondary' : 'outline';
	}

	function fmtDate(d: Date | string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
	}

	const columns: ColumnDef<Listing>[] = [
		{ id: 'star', header: '', cell: ({ row }) => renderSnippet(starCell, { job: row.original }) },
		{
			id: 'score',
			header: 'Score',
			cell: ({ row }) => renderSnippet(scoreCell, { job: row.original })
		},
		{
			id: 'title',
			header: 'Stelle',
			cell: ({ row }) => renderSnippet(titleCell, { job: row.original })
		},
		{
			id: 'company',
			header: 'Unternehmen',
			cell: ({ row }) => renderSnippet(companyCell, { job: row.original })
		},
		{
			id: 'location',
			header: 'Ort',
			cell: ({ row }) => renderSnippet(locationCell, { job: row.original })
		},
		{
			id: 'source',
			header: 'Portal',
			cell: ({ row }) => renderSnippet(sourceCell, { job: row.original })
		},
		{ id: 'date', header: 'Datum', cell: ({ row }) => fmtDate(row.original.postedAt) },
		{
			id: 'actions',
			header: '',
			cell: ({ row }) => renderSnippet(actionCell, { job: row.original })
		}
	];
</script>

{#snippet starCell({ job }: { job: Listing })}
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={job.starred ? 'Markierung entfernen' : 'Stelle markieren'}
		onclick={() => toggleStar(job)}
	>
		<Star class={['size-4', job.starred && 'fill-amber-400 text-amber-500']} />
	</Button>
{/snippet}

{#snippet scoreCell({ job }: { job: Listing })}
	{#if job.rankScore != null}
		<Badge variant={verdictVariant(job.rankVerdict)}>{job.rankScore}</Badge>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet titleCell({ job }: { job: Listing })}
	<div class={['max-w-md font-medium whitespace-normal', job.status === 'closed' && 'opacity-50']}>
		{job.title}
	</div>
{/snippet}

{#snippet companyCell({ job }: { job: Listing })}
	<div class="hidden max-w-64 whitespace-normal md:block">{job.company ?? '—'}</div>
{/snippet}

{#snippet locationCell({ job }: { job: Listing })}
	<div class="hidden lg:block">{job.location ?? '—'}</div>
{/snippet}

{#snippet sourceCell({ job }: { job: Listing })}
	<div class="hidden xl:block">{SOURCE_LABELS[job.source] ?? job.source}</div>
{/snippet}

{#snippet actionCell({ job }: { job: Listing })}
	<Button variant="outline" size="sm" onclick={() => (selected = job)}>
		<Eye class="size-4" />
		<span class="sr-only sm:not-sr-only">Details</span>
	</Button>
{/snippet}

<div class="space-y-4">
	<h1 class="text-2xl font-semibold">Stellen</h1>

	<div class="flex flex-wrap items-end gap-4">
		<div class="space-y-1">
			<Label for="src">Portal</Label>
			<NativeSelect id="src" bind:value={sourceFilter} onchange={reset} class="w-40">
				<option value="all">Alle Portale</option>
				{#each Object.entries(SOURCE_LABELS) as [id, label] (id)}
					<option value={id}>{label}</option>
				{/each}
			</NativeSelect>
		</div>
		<div class="space-y-1">
			<Label for="vd">Bewertung</Label>
			<NativeSelect id="vd" bind:value={verdictFilter} onchange={reset} class="w-40">
				<option value="all">Alle</option>
				<option value="strong">Passt gut</option>
				<option value="maybe">Vielleicht</option>
				<option value="weak">Schwach</option>
			</NativeSelect>
		</div>
		<label class="flex items-center gap-2 pb-2 text-sm">
			<Checkbox
				checked={showClosed}
				onCheckedChange={(checked) => {
					showClosed = checked;
					reset();
				}}
			/>
			Geschlossene zeigen
		</label>
	</div>

	<InfiniteDataTable
		{controller}
		{columns}
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
					{selected.company ?? 'Unbekanntes Unternehmen'} · {selected.location ?? 'Wien'}
				</Sheet.Description>
			</Sheet.Header>
			<div class="space-y-4 px-4 pb-4">
				<div class="flex flex-wrap items-center gap-2">
					{#if selected.rankScore != null}
						<Badge variant={verdictVariant(selected.rankVerdict)}>Score {selected.rankScore}</Badge>
					{/if}
					<Badge variant="outline">{SOURCE_LABELS[selected.source] ?? selected.source}</Badge>
					{#if selected.salary}<Badge variant="outline">{selected.salary}</Badge>{/if}
					{#if selected.status === 'closed'}<Badge variant="destructive">geschlossen</Badge>{/if}
				</div>
				{#if selected.rankReason}
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
