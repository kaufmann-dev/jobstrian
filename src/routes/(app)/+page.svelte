<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { RunPhaseId, RunPhaseProgress, RunProgress, ScrapeRun } from '$lib/server/db/schema';

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
	const progress = $derived(normalizeProgress(run));
	const phaseRows = $derived(toPhaseRows(progress));
	const overallPercent = $derived(progress.overall.percent);

	const statCards = $derived([
		{ label: 'Aktive Stellen', value: stats.activeListings },
		{ label: 'Davon bewertet', value: stats.rankedListings },
		{ label: 'Geschlossen', value: stats.closedListings },
		{ label: 'Betriebe in der Nähe', value: stats.totalLeads },
		{ label: 'Mit E-Mail', value: stats.leadsWithEmail },
		{ label: 'Ohne Ausschreibung', value: stats.openLeads }
	]);

	type StartRunResponse =
		| { started: true; runId: number }
		| { started: false; reason: string; message?: string };

	type RunStatusResponse = { run: ScrapeRun | null };
	type PhaseRow = RunPhaseProgress & { id: RunPhaseId; label: string };

	const phaseLabels: Record<RunPhaseId, string> = {
		setup: 'Vorbereitung',
		scrape: 'Quellen',
		reconcile: 'Abgleich',
		leads: 'Betriebe',
		'rank-listings': 'Stellenbewertung',
		'rank-leads': 'Betriebsbewertung',
		finalize: 'Abschluss'
	};

	function fallbackProgress(currentRun: ScrapeRun | null): RunProgress {
		return {
			version: 1,
			headline: currentRun?.phase ?? 'Noch kein Lauf',
			detail: currentRun?.error ?? '',
			overall: { current: currentRun ? 1 : 0, total: 1, percent: currentRun ? 100 : 0 },
			phases: {
				setup: {
					state: currentRun ? 'done' : 'pending',
					current: currentRun ? 1 : 0,
					total: 1,
					detail: '',
					skipped: 0,
					failed: 0
				},
				scrape: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				reconcile: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				leads: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				'rank-listings': {
					state: 'pending',
					current: 0,
					total: 0,
					detail: '',
					skipped: 0,
					failed: 0
				},
				'rank-leads': { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				finalize: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 }
			},
			llm: { queued: 0, inFlight: 0, completed: 0, failed: 0, skipped: 0, lastMinuteStarted: 0 }
		};
	}

	function normalizeProgress(currentRun: ScrapeRun | null): RunProgress {
		if (currentRun?.progress?.version === 1) return currentRun.progress;
		return fallbackProgress(currentRun);
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
		if (status === 'done') return 'default';
		if (status === 'error') return 'destructive';
		if (status === 'canceled') return 'outline';
		return 'secondary';
	}

	function phaseStateLabel(state: RunPhaseProgress['state']): string {
		if (state === 'running') return 'läuft';
		if (state === 'done') return 'fertig';
		if (state === 'skipped') return 'übersprungen';
		if (state === 'error') return 'Fehler';
		if (state === 'canceled') return 'abgebrochen';
		return 'wartet';
	}

	function phasePercent(phase: RunPhaseProgress): number {
		if (phase.total <= 0) return phase.state === 'done' || phase.state === 'skipped' ? 100 : 0;
		return Math.round((Math.min(phase.current, phase.total) / phase.total) * 100);
	}

	function toDate(value: Date | string | null | undefined): Date | null {
		if (!value) return null;
		return value instanceof Date ? value : new Date(value);
	}

	function elapsedLabel(currentRun: ScrapeRun | null): string {
		const start = toDate(currentRun?.startedAt);
		if (!start) return '';
		const end = toDate(currentRun?.finishedAt) ?? new Date();
		const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
		const minutes = Math.floor(seconds / 60);
		const rest = seconds % 60;
		return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
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
				Hinterlege in den <a class="underline" href={resolve('/settings')}>Einstellungen</a> eine OpenAI-kompatible
				API, damit Stellen automatisch bewertet werden.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if !hasHome}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Wohnort fehlt</Alert.Title>
			<Alert.Description>
				Trage deine Adresse in den <a class="underline" href={resolve('/settings')}>Einstellungen</a
				> ein, um Betriebe in der Nähe zu finden.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if run}
		<Card.Root>
			<Card.Header class="gap-3">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
							<Card.Title class="text-base">{progress.headline}</Card.Title>
						</div>
						<Card.Description>
							{#if progress.detail}{progress.detail}{:else}Dauer: {elapsedLabel(run)}{/if}
						</Card.Description>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs whitespace-nowrap text-muted-foreground">{elapsedLabel(run)}</span>
						{#if isActive}
							<Button
								variant="outline"
								size="sm"
								class="border-destructive text-destructive hover:bg-destructive/10"
								onclick={cancelRun}
								disabled={canceling || run.status === 'canceling'}
							>
								{#if canceling || run.status === 'canceling'}
									<Spinner class="size-4" />
								{:else}
									<X class="size-4" />
								{/if}
								Abbrechen
							</Button>
						{/if}
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-3 text-sm">
						<span class="font-medium">Gesamt</span>
						<span class="text-muted-foreground">
							{progress.overall.current} / {progress.overall.total}
						</span>
					</div>
					<Progress value={overallPercent} />
				</div>

				<div class="grid gap-3">
					{#each phaseRows as phase (phase.id)}
						<div class="space-y-1.5">
							<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
								<div class="flex min-w-0 items-center gap-2">
									<span class="font-medium">{phase.label}</span>
									<Badge variant={phase.state === 'error' ? 'destructive' : 'outline'}>
										{phaseStateLabel(phase.state)}
									</Badge>
								</div>
								<div class="text-xs whitespace-nowrap text-muted-foreground">
									{phase.current} / {phase.total}
									{#if phase.skipped > 0}
										· übersprungen: {phase.skipped}{/if}
									{#if phase.failed > 0}
										· fehlgeschlagen: {phase.failed}{/if}
								</div>
							</div>
							<Progress value={phasePercent(phase)} class="h-1.5" />
							{#if phase.detail}
								<p class="text-xs break-words text-muted-foreground">{phase.detail}</p>
							{/if}
						</div>
					{/each}
				</div>

				<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
					<span>Neu: {run.counts.added}</span>
					<span>Geschlossen: {run.counts.closed}</span>
					<span>Bewertet: {run.counts.ranked}</span>
					<span>Betriebe: {run.counts.leads}</span>
					<span>
						LLM: 300 RPM Limit, {progress.llm.inFlight} parallel, {progress.llm.queued} in Warteschlange
					</span>
					{#if run.error}<span class="text-destructive">{run.error}</span>{/if}
				</div>
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
