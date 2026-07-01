<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import RunStatusCard, { type RunStatusCardPhase } from '$lib/components/run-status-card.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Archive from '@lucide/svelte/icons/archive';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mail from '@lucide/svelte/icons/mail';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import { normalizeRunProgress, RUN_PHASE_LABELS } from '$lib/run-progress';
	import type { RunPhaseId, RunProgress, ScrapeRun } from '$lib/server/db/schema';

	let { data } = $props();

	// While polling we override the loaded run; otherwise fall back to fresh data.
	let polledRun = $state.raw<ScrapeRun | null>(null);
	let starting = $state(false);
	let canceling = $state(false);
	let polling = false;
	let stopped = false;

	const run = $derived(polledRun ?? data.latestRun);
	const isActive = $derived(run?.status === 'running' || run?.status === 'canceling');
	const isRunning = $derived(isActive || starting);
	const stats = $derived(data.stats);
	const configured = $derived(data.configured);
	const hasHome = $derived(data.hasHome);
	const hasSearchConfig = $derived(data.hasSearchConfig);
	const progress = $derived(normalizeProgress(run));
	const phaseRows = $derived(toPhaseRows(progress));
	const currentPhase = $derived(
		phaseRows.find((phase) => phase.state === 'running') ??
			phaseRows.find((phase) => phase.state === 'warning' || phase.state === 'error') ??
			phaseRows.findLast((phase) => phase.state === 'done')
	);
	const totalFailed = $derived(phaseRows.reduce((sum, phase) => sum + phase.failed, 0));
	const dominantFailureReason = $derived.by(() => {
		const totals: Record<string, { label: string; count: number }> = {};
		for (const phase of phaseRows) {
			for (const reason of phase.failureReasons ?? []) {
				const existing = totals[reason.code];
				if (existing) existing.count += reason.count;
				else totals[reason.code] = { label: reason.label, count: reason.count };
			}
		}
		let top: { label: string; count: number } | undefined;
		for (const reason of Object.values(totals)) if (!top || reason.count > top.count) top = reason;
		return top?.label;
	});

	const statGroups = $derived([
		{
			title: 'Stellen',
			cards: [
				{
					label: 'Aktive Stellen',
					value: stats.activeListings,
					href: '/jobs',
					icon: Briefcase
				},
				{
					label: 'Davon bewertet',
					value: stats.rankedListings,
					href: '/jobs',
					icon: Sparkles
				},
				{ label: 'Geschlossen', value: stats.closedListings, href: '/jobs', icon: Archive }
			]
		},
		{
			title: 'Betriebe',
			cards: [
				{ label: 'In der Nähe', value: stats.totalLeads, href: '/leads', icon: MapPin },
				{ label: 'Mit E-Mail', value: stats.leadsWithEmail, href: '/leads', icon: Mail },
				{
					label: 'Ohne Ausschreibung',
					value: stats.openLeads,
					href: '/leads',
					icon: DoorOpen
				}
			]
		}
	]);

	type StartRunResponse =
		| { started: true; runId: number }
		| { started: false; reason: string; message?: string };

	type RunStatusResponse = { run: ScrapeRun | null };
	type PhaseRow = RunStatusCardPhase & { id: RunPhaseId };

	const phaseLabels = RUN_PHASE_LABELS;

	function normalizeProgress(currentRun: ScrapeRun | null): RunProgress {
		return normalizeRunProgress(currentRun);
	}

	function toPhaseRows(currentProgress: RunProgress): PhaseRow[] {
		return (Object.keys(phaseLabels) as RunPhaseId[]).map((id) => ({
			id,
			label: phaseLabels[id],
			...currentProgress.phases[id]
		}));
	}

	function statusLabel(status: ScrapeRun['status'] | undefined): string {
		if (status === 'running') return 'läuft';
		if (status === 'canceling') return 'bricht ab';
		if (status === 'canceled') return 'abgebrochen';
		if (status === 'done') return 'fertig';
		if (status === 'error') return 'Fehler';
		return 'bereit';
	}

	function statusVariant(
		status: ScrapeRun['status'] | undefined
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'error') return 'destructive';
		return 'secondary';
	}

	async function readStartResponse(res: Response): Promise<StartRunResponse | null> {
		try {
			return (await res.json()) as StartRunResponse;
		} catch {
			return null;
		}
	}

	function startFailureToast(res: Response, body: StartRunResponse | null): string {
		if (body && !body.started && body.message) return body.message;
		return `Aktualisierung konnte nicht gestartet werden (${res.status}).`;
	}

	async function poll() {
		if (polling) return;
		polling = true;
		let finalRun: ScrapeRun | null = null;
		try {
			while (!stopped) {
				const res = await fetch('/api/run/status');
				const body = (await res.json()) as RunStatusResponse;
				polledRun = body.run;
				finalRun = polledRun;
				if (!polledRun || (polledRun.status !== 'running' && polledRun.status !== 'canceling'))
					break;
				await new Promise((r) => setTimeout(r, 1000));
			}
		} finally {
			polling = false;
			await invalidateAll();
			if (finalRun?.status === 'done') toast.success('Aktualisierung abgeschlossen');
			if (finalRun?.status === 'canceled') toast.info('Aktualisierung abgebrochen');
			if (finalRun?.status === 'error') toast.error('Aktualisierung fehlgeschlagen');
		}
	}

	async function update() {
		starting = true;
		try {
			const res = await fetch('/api/run/start', { method: 'POST' });
			const body = await readStartResponse(res);
			if (res.status === 409) {
				toast.info(startFailureToast(res, body));
			} else if (!res.ok) {
				toast.error(startFailureToast(res, body));
				return;
			}
			await poll();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Aktualisierung konnte nicht gestartet werden: ${message}`);
		} finally {
			starting = false;
		}
	}

	async function cancelRun() {
		if (!run) return;
		canceling = true;
		try {
			const res = await fetch('/api/run/cancel', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ runId: run.id })
			});
			if (!res.ok) {
				toast.error(`Abbruch konnte nicht angefordert werden (${res.status}).`);
				return;
			}
			await poll();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Abbruch konnte nicht angefordert werden: ${message}`);
		} finally {
			canceling = false;
		}
	}

	onMount(() => {
		if (run?.status === 'running' || run?.status === 'canceling') poll();
		return () => {
			stopped = true;
		};
	});
</script>

<svelte:head>
	<title>Übersicht · Jobstrian</title>
	<meta
		name="description"
		content="Überblick über deine Suchläufe: Fortschritt, neue Stellen und Betriebe auf einen Blick."
	/>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Übersicht"
		description="Deine automatisierte Jobsuche und Arbeitgeber-Recherche in Österreich."
	>
		{#snippet actions()}
			<Button onclick={update} disabled={isRunning} size="lg">
				{#if isRunning}
					<Spinner class="size-4" />
				{:else}
					<RefreshCw class="size-4" />
				{/if}
				Aktualisieren
			</Button>
		{/snippet}
	</PageHeader>

	{#if !configured}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>LLM noch nicht konfiguriert</Alert.Title>
			<Alert.Description>
				Hinterlege in den <a class="underline" href={resolve('/settings')}>Einstellungen</a> eine OpenAI-kompatible
				API, damit Stellen automatisch bewertet werden.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if !hasHome}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Adresse nicht bestätigt</Alert.Title>
			<Alert.Description>
				Wähle deine Adresse in den <a class="underline" href={resolve('/settings')}>Einstellungen</a
				> aus den Vorschlägen aus, um Job-Suchorte abzuleiten und nahe potenzielle Arbeitgeber zu finden.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if !hasSearchConfig}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Suchkonfiguration fehlt</Alert.Title>
			<Alert.Description>
				Hinterlege in den <a class="underline" href={resolve('/settings')}>Einstellungen</a>
				Stellen-Keywords und Betriebskategorien, damit passende Stellen und nahe potenzielle Arbeitgeber
				gefunden werden.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if run}
		<RunStatusCard
			title={progress.headline}
			statusLabel={statusLabel(run.status)}
			statusVariant={statusVariant(run.status)}
			active={isActive}
			phases={phaseRows}
			summary={isActive
				? `${currentPhase?.label ?? 'Aktualisierung'} · ${currentPhase?.detail || progress.detail || 'Bereit'}`
				: totalFailed > 0
					? `${totalFailed} ${totalFailed === 1 ? 'Bewertung' : 'Bewertungen'} fehlgeschlagen${dominantFailureReason ? ` · ${dominantFailureReason}` : '.'}`
					: undefined}
		>
			{#snippet actions()}
				{#if isActive}
					<Button
						variant="outline"
						size="sm"
						class="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
						aria-label="Abbrechen"
						onclick={cancelRun}
						disabled={canceling || run.status === 'canceling'}
					>
						{#if canceling || run.status === 'canceling'}
							<Spinner class="size-4" />
						{:else}
							<X class="size-4" />
						{/if}
						<span class="hidden sm:inline">Abbrechen</span>
					</Button>
				{/if}
			{/snippet}

			{#snippet footer()}
				<p class="border-t pt-3 text-sm text-muted-foreground">
					{run.counts.added} neue Stellen · {run.counts.closed} nicht mehr verfügbar · {run.counts
						.ranked} bewertet · {run.counts.leads} Betriebe gefunden
					{#if isActive}
						· KI: {progress.llm.inFlight} aktiv, {progress.llm.queued} warten
					{/if}
				</p>
				{#if run.error}
					<p class="text-sm text-destructive">{run.error}</p>
				{/if}
			{/snippet}
		</RunStatusCard>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		{#each statGroups as group (group.title)}
			<section class="space-y-3">
				<h2 class="text-sm font-medium tracking-wide text-muted-foreground uppercase">
					{group.title}
				</h2>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{#each group.cards as card (card.label)}
						<a
							href={resolve(card.href as '/jobs' | '/leads')}
							class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Card.Root
								class="h-full py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 sm:py-5"
							>
								<div class="flex items-center gap-3 px-5 sm:flex-col sm:items-start sm:gap-2">
									<span
										class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-8"
									>
										<card.icon class="size-4" />
									</span>
									<Card.Title
										class="order-last ml-auto text-2xl tabular-nums sm:order-none sm:ml-0 sm:text-3xl"
									>
										{card.value.toLocaleString('de-AT')}
									</Card.Title>
									<Card.Description class="w-full truncate" title={card.label}>
										{card.label}
									</Card.Description>
								</div>
							</Card.Root>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
