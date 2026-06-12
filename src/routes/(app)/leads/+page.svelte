<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import InfiniteDataTable from '$lib/components/infinite-data-table.svelte';
	import { InfiniteListController } from '$lib/components/infinite-list-controller.svelte.js';
	import { renderSnippet } from '$lib/components/ui/data-table/render-helpers.js';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Globe from '@lucide/svelte/icons/globe';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Eye from '@lucide/svelte/icons/eye';
	import type { Lead } from '$lib/server/db/schema';

	let { data } = $props();

	const controller = new InfiniteListController<Lead>(
		'/api/leads',
		untrack(() => data.page)
	);
	let onlyWithEmail = $state(false);
	let onlyOpen = $state(true);
	let hideIgnored = $state(true);
	let selected = $state<Lead | null>(null);

	function query(): string {
		const params = new URLSearchParams({
			onlyWithEmail: String(onlyWithEmail),
			onlyOpen: String(onlyOpen),
			hideIgnored: String(hideIgnored)
		});
		return params.toString();
	}

	function reset(): void {
		void controller.reset(query());
		selected = null;
	}

	async function copy(text: string, what: string): Promise<void> {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} kopiert`);
	}

	async function setStatus(item: Lead, status: Lead['status']): Promise<void> {
		const response = await fetch(`/api/leads/${item.id}/status`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status })
		});
		if (!response.ok) {
			toast.error('Status konnte nicht gespeichert werden.');
			return;
		}
		await controller.reset(query());
		selected = null;
	}

	function mailtoHref(item: Lead): string {
		const params = new URLSearchParams();
		if (item.draftSubject) params.set('subject', item.draftSubject);
		if (item.draftBody) params.set('body', item.draftBody);
		return `mailto:${item.email}${params.size ? '?' + params : ''}`;
	}

	const columns: ColumnDef<Lead>[] = [
		{
			id: 'score',
			header: 'Score',
			cell: ({ row }) => renderSnippet(scoreCell, { item: row.original })
		},
		{
			id: 'business',
			header: 'Betrieb',
			cell: ({ row }) => renderSnippet(businessCell, { item: row.original })
		},
		{ id: 'distance', header: 'Entfernung', cell: ({ row }) => `${row.original.distanceMeters} m` },
		{
			id: 'contact',
			header: 'Kontakt',
			cell: ({ row }) => renderSnippet(contactCell, { item: row.original })
		},
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }) => renderSnippet(statusCell, { item: row.original })
		},
		{
			id: 'actions',
			header: '',
			cell: ({ row }) => renderSnippet(actionCell, { item: row.original })
		}
	];
</script>

{#snippet scoreCell({ item }: { item: Lead })}
	{#if item.rankScore != null}<Badge>{item.rankScore}</Badge>{:else}<span
			class="text-muted-foreground">—</span
		>{/if}
{/snippet}

{#snippet businessCell({ item }: { item: Lead })}
	<div class="max-w-md whitespace-normal">
		<p class="font-medium">{item.name}</p>
		<p class="text-xs text-muted-foreground">{item.category ?? 'Betrieb'}</p>
	</div>
{/snippet}

{#snippet contactCell({ item }: { item: Lead })}
	<div class="hidden gap-1 md:flex">
		<Badge variant={item.email ? 'default' : 'outline'}
			>{item.email ? 'E-Mail' : 'keine E-Mail'}</Badge
		>
		{#if item.phone}<Badge variant="outline">Telefon</Badge>{/if}
	</div>
{/snippet}

{#snippet statusCell({ item }: { item: Lead })}
	<div class="hidden flex-wrap gap-1 lg:flex">
		{#if item.hasActivePosting}<Badge variant="secondary">hat Ausschreibung</Badge>{/if}
		{#if item.status === 'contacted'}<Badge>kontaktiert</Badge>{/if}
		{#if item.status === 'ignored'}<Badge variant="destructive">ignoriert</Badge>{/if}
		{#if item.status === 'new'}<Badge variant="outline">neu</Badge>{/if}
	</div>
{/snippet}

{#snippet actionCell({ item }: { item: Lead })}
	<Button variant="outline" size="sm" onclick={() => (selected = item)}>
		<Eye class="size-4" />
		<span class="sr-only sm:not-sr-only">Details</span>
	</Button>
{/snippet}

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-semibold">Betriebe in der Nähe</h1>
		<p class="text-sm text-muted-foreground">
			Gastronomie im Umkreis deines Wohnorts · ideal für Initiativbewerbungen.
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-4 text-sm">
		<label class="flex items-center gap-2">
			<Checkbox
				checked={onlyWithEmail}
				onCheckedChange={(checked) => {
					onlyWithEmail = checked;
					reset();
				}}
			/>
			Nur mit E-Mail
		</label>
		<label class="flex items-center gap-2">
			<Checkbox
				checked={onlyOpen}
				onCheckedChange={(checked) => {
					onlyOpen = checked;
					reset();
				}}
			/>
			Nur ohne Ausschreibung
		</label>
		<label class="flex items-center gap-2">
			<Checkbox
				checked={hideIgnored}
				onCheckedChange={(checked) => {
					hideIgnored = checked;
					reset();
				}}
			/>
			Ignorierte ausblenden
		</label>
	</div>

	<InfiniteDataTable
		{controller}
		{columns}
		itemLabel="Betrieben"
		emptyText="Noch keine Betriebe. Trage deinen Wohnort in den Einstellungen ein und aktualisiere."
	/>
</div>

<Sheet.Root open={selected !== null} onOpenChange={(open) => !open && (selected = null)}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-xl">
		{#if selected}
			<Sheet.Header>
				<Sheet.Title>{selected.name}</Sheet.Title>
				<Sheet.Description
					>{selected.category ?? 'Betrieb'} · {selected.distanceMeters} m</Sheet.Description
				>
			</Sheet.Header>
			<div class="space-y-5 px-4 pb-4">
				<div class="flex flex-wrap gap-2">
					{#if selected.rankScore != null}<Badge>Score {selected.rankScore}</Badge>{/if}
					{#if selected.hasActivePosting}<Badge variant="secondary">hat Ausschreibung</Badge>{/if}
					<Badge variant="outline">{selected.status}</Badge>
				</div>
				{#if selected.rankReason}<p class="text-sm text-muted-foreground">
						{selected.rankReason}
					</p>{/if}
				<div class="space-y-2 text-sm">
					{#if selected.address}<p>{selected.address}</p>{/if}
					{#if selected.email}
						<button
							class="flex items-center gap-2 underline"
							onclick={() => copy(selected!.email!, 'E-Mail')}
						>
							<Mail class="size-4" />
							{selected.email}
						</button>
					{/if}
					{#if selected.phone}<p class="flex items-center gap-2">
							<Phone class="size-4" />
							{selected.phone}
						</p>{/if}
					{#if selected.website}
						<a class="flex items-center gap-2 underline" href={selected.website} target="_blank">
							<Globe class="size-4" /> Website
						</a>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onclick={() =>
							setStatus(selected!, selected!.status === 'contacted' ? 'new' : 'contacted')}
					>
						{selected.status === 'contacted' ? 'Zurücksetzen' : 'Kontaktiert'}
					</Button>
					<Button variant="ghost" onclick={() => setStatus(selected!, 'ignored')}>Ignorieren</Button
					>
				</div>
				{#if selected.draftBody}
					<div class="space-y-3 border-t pt-4">
						<div class="space-y-1">
							<Label for="subj">Betreff</Label>
							<div class="flex gap-2">
								<Input id="subj" readonly value={selected.draftSubject ?? ''} />
								<Button
									variant="outline"
									size="icon"
									onclick={() => copy(selected!.draftSubject ?? '', 'Betreff')}
								>
									<Copy class="size-4" />
								</Button>
							</div>
						</div>
						<div class="space-y-1">
							<Label for="body">Nachricht</Label>
							<Textarea id="body" readonly rows={10} value={selected.draftBody} />
						</div>
						{#if data.hasCv}
							<a href="/api/cv" class="flex items-center gap-2 text-sm underline">
								<Paperclip class="size-4" />
								<Download class="size-4" /> Lebenslauf herunterladen
							</a>
						{/if}
						<div class="flex gap-2">
							<Button class="flex-1" onclick={() => copy(selected!.draftBody ?? '', 'Nachricht')}>
								<Copy class="size-4" /> Text kopieren
							</Button>
							{#if selected.email}
								<Button class="flex-1" variant="outline" href={mailtoHref(selected)}>
									<Mail class="size-4" /> In E-Mail öffnen
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
