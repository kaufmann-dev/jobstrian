<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { ScrapeRun } from '$lib/server/db/schema';

	let { data } = $props();

	// While polling we override the loaded run; otherwise fall back to fresh data.
	let polledRun = $state<ScrapeRun | null>(null);
	let starting = $state(false);
	let polling = false;

	const run = $derived(polledRun ?? data.latestRun);
	const isRunning = $derived(run?.status === 'running' || starting);
	const stats = $derived(data.stats);
	const configured = $derived(data.configured);
	const hasHome = $derived(data.hasHome);

	const statCards = $derived([
		{ label: 'Aktive Stellen', value: stats.activeListings },
		{ label: 'Davon bewertet', value: stats.rankedListings },
		{ label: 'Geschlossen', value: stats.closedListings },
		{ label: 'Betriebe in der Nähe', value: stats.totalLeads },
		{ label: 'Mit E-Mail', value: stats.leadsWithEmail },
		{ label: 'Ohne Ausschreibung', value: stats.openLeads }
	]);

	async function poll() {
		if (polling) return;
		polling = true;
		try {
			while (true) {
				const res = await fetch('/api/run/status');
				const body = (await res.json()) as { run: ScrapeRun | null };
				polledRun = body.run;
				if (!polledRun || polledRun.status !== 'running') break;
				await new Promise((r) => setTimeout(r, 1500));
			}
		} finally {
			polling = false;
			await invalidateAll();
			if (run?.status === 'done') toast.success('Aktualisierung abgeschlossen');
			if (run?.status === 'error') toast.error('Aktualisierung fehlgeschlagen');
		}
	}

	async function update() {
		starting = true;
		try {
			const res = await fetch('/api/run/start', { method: 'POST' });
			if (res.status === 409) {
				toast.info('Eine Aktualisierung läuft bereits.');
			} else if (!res.ok) {
				toast.error('Start fehlgeschlagen.');
			}
			await poll();
		} finally {
			starting = false;
		}
	}

	onMount(() => {
		if (run?.status === 'running') poll();
	});
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Übersicht</h1>
			<p class="text-sm text-muted-foreground">Deine automatisierte Jobsuche in Wien.</p>
		</div>
		<Button onclick={update} disabled={isRunning} size="lg">
			{#if isRunning}
				<Spinner class="size-4" />
			{:else}
				<RefreshCw class="size-4" />
			{/if}
			Aktualisieren
		</Button>
	</div>

	{#if !configured}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>LLM noch nicht konfiguriert</Alert.Title>
			<Alert.Description>
				Hinterlege in den <a class="underline" href="/settings">Einstellungen</a> eine OpenAI-kompatible
				API, damit Stellen automatisch bewertet werden.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if !hasHome}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Wohnort fehlt</Alert.Title>
			<Alert.Description>
				Trage deine Adresse in den <a class="underline" href="/settings">Einstellungen</a> ein, um Betriebe
				in der Nähe zu finden.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if run}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					Letzter Lauf
					{#if run.status === 'running'}
						<Badge variant="secondary">läuft</Badge>
					{:else if run.status === 'done'}
						<Badge>fertig</Badge>
					{:else}
						<Badge variant="destructive">Fehler</Badge>
					{/if}
				</Card.Title>
				<Card.Description>{run.phase}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
				<span>Neu: {run.counts.added}</span>
				<span>Geschlossen: {run.counts.closed}</span>
				<span>Bewertet: {run.counts.ranked}</span>
				<span>Betriebe: {run.counts.leads}</span>
				{#if run.error}<span class="text-destructive">{run.error}</span>{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
		{#each statCards as card (card.label)}
			<Card.Root>
				<Card.Header>
					<Card.Description>{card.label}</Card.Description>
					<Card.Title class="text-3xl">{card.value}</Card.Title>
				</Card.Header>
			</Card.Root>
		{/each}
	</div>
</div>
