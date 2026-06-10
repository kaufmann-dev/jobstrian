<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import type { Listing } from '$lib/server/db/schema';

	let { data } = $props();

	const SOURCE_LABELS: Record<string, string> = {
		willhaben: 'willhaben',
		karriere: 'karriere.at',
		hokify: 'hokify',
		ams: 'AMS'
	};

	let sourceFilter = $state('all');
	let verdictFilter = $state('all');
	let showClosed = $state(false);
	let selected = $state<Listing | null>(null);

	const filtered = $derived(
		data.listings.filter((j) => {
			if (!showClosed && j.status === 'closed') return false;
			if (sourceFilter !== 'all' && j.source !== sourceFilter) return false;
			if (verdictFilter !== 'all' && j.rankVerdict !== verdictFilter) return false;
			return true;
		})
	);

	function verdictVariant(v: string | null): 'default' | 'secondary' | 'outline' {
		return v === 'strong' ? 'default' : v === 'maybe' ? 'secondary' : 'outline';
	}

	function fmtDate(d: Date | string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
	}
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-semibold">Stellen</h1>

	<div class="flex flex-wrap items-end gap-4">
		<div class="space-y-1">
			<Label for="src">Portal</Label>
			<NativeSelect id="src" bind:value={sourceFilter} class="w-40">
				<option value="all">Alle Portale</option>
				{#each Object.entries(SOURCE_LABELS) as [id, label] (id)}
					<option value={id}>{label}</option>
				{/each}
			</NativeSelect>
		</div>
		<div class="space-y-1">
			<Label for="vd">Bewertung</Label>
			<NativeSelect id="vd" bind:value={verdictFilter} class="w-40">
				<option value="all">Alle</option>
				<option value="strong">Passt gut</option>
				<option value="maybe">Vielleicht</option>
				<option value="weak">Schwach</option>
			</NativeSelect>
		</div>
		<label class="flex items-center gap-2 pb-2 text-sm">
			<Checkbox bind:checked={showClosed} />
			Geschlossene zeigen
		</label>
		<span class="ml-auto pb-2 text-sm text-muted-foreground">{filtered.length} Stellen</span>
	</div>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">Score</Table.Head>
					<Table.Head>Titel</Table.Head>
					<Table.Head class="hidden md:table-cell">Unternehmen</Table.Head>
					<Table.Head class="hidden lg:table-cell">Ort</Table.Head>
					<Table.Head class="hidden sm:table-cell">Portal</Table.Head>
					<Table.Head class="w-16">Datum</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filtered as job (job.id)}
					<Table.Row
						class="cursor-pointer {job.status === 'closed' ? 'opacity-50' : ''}"
						onclick={() => (selected = job)}
					>
						<Table.Cell>
							{#if job.rankScore != null}
								<Badge variant={verdictVariant(job.rankVerdict)}>{job.rankScore}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="font-medium">{job.title}</Table.Cell>
						<Table.Cell class="hidden md:table-cell">{job.company ?? '—'}</Table.Cell>
						<Table.Cell class="hidden lg:table-cell">{job.location ?? '—'}</Table.Cell>
						<Table.Cell class="hidden sm:table-cell">
							{SOURCE_LABELS[job.source] ?? job.source}
						</Table.Cell>
						<Table.Cell>{fmtDate(job.postedAt)}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={6} class="text-muted-foreground py-8 text-center">
							Keine Stellen. Klicke auf „Aktualisieren“ in der Übersicht.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<Sheet.Root open={selected !== null} onOpenChange={(o) => !o && (selected = null)}>
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
						<Badge variant={verdictVariant(selected.rankVerdict)}>
							Score {selected.rankScore}
						</Badge>
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
