<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
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
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Archive from '@lucide/svelte/icons/archive';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Mail from '@lucide/svelte/icons/mail';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import type { RunPhaseId, RunPhaseProgress, RunProgress, ScrapeRun } from '$lib/server/db/schema';

	let { data } = $props();

	// While polling we override the loaded run; otherwise fall back to fresh data.
	let polledRun = $state.raw<ScrapeRun | null>(null);
	let starting = $state(false);
	let canceling = $state(false);
	let progressExpanded = $state(false);
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
	const currentPhase = $derived(
		phaseRows.find((phase) => phase.state === 'running') ??
			phaseRows.find((phase) => phase.state === 'warning' || phase.state === 'error') ??
			phaseRows.findLast((phase) => phase.state === 'done')
	);

	const statGroups = $derived([
		{
			title: 'Stellen',
			cards: [
				{
					label: 'Aktive Stellen',
					value: stats.activeListings,
					href: resolve('/jobs'),
					icon: Briefcase
				},
				{
					label: 'Davon bewertet',
					value: stats.rankedListings,
					href: resolve('/jobs'),
					icon: Sparkles
				},
				{ label: 'Geschlossen', value: stats.closedListings, href: resolve('/jobs'), icon: Archive }
			]
		},
		{
			title: 'Betriebe',
			cards: [
				{ label: 'In der Nähe', value: stats.totalLeads, href: resolve('/leads'), icon: MapPin },
				{ label: 'Mit E-Mail', value: stats.leadsWithEmail, href: resolve('/leads'), icon: Mail },
				{
					label: 'Ohne Ausschreibung',
					value: stats.openLeads,
					href: resolve('/leads'),
					icon: DoorOpen
				}
			]
		}
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
			llm: {
				requestsPerMinute: 300,
				maxConcurrent: 50,
				queued: 0,
				inFlight: 0,
				completed: 0,
				failed: 0,
				skipped: 0,
				lastMinuteStarted: 0
			}
		};
	}

	function normalizeProgress(currentRun: ScrapeRun | null): RunProgress {
		const fallback = fallbackProgress(currentRun);
		const stored = currentRun?.progress as Partial<RunProgress> | null | undefined;
		if (stored?.version !== 1) return fallback;
		const phases = Object.fromEntries(
			(Object.keys(phaseLabels) as RunPhaseId[]).map((id) => {
				const phase = { ...fallback.phases[id], ...stored.phases?.[id] };
				if (
					currentRun?.status === 'done' &&
					(phase.state === 'error' || (phase.state === 'done' && phase.failed > 0))
				) {
					phase.state = 'warning';
				}
				return [id, phase];
			})
		) as RunProgress['phases'];
		return {
			...fallback,
			...stored,
			headline: stored.headline ?? fallback.headline,
			detail: stored.detail ?? fallback.detail,
			phases,
			llm: { ...fallback.llm, ...stored.llm }
		};
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
		if (state === 'warning') return 'mit Warnung fertig';
		if (state === 'skipped') return 'übersprungen';
		if (state === 'error') return 'Fehler';
		if (state === 'canceled') return 'abgebrochen';
		return 'wartet';
	}

	function phaseAccent(state: RunPhaseProgress['state']): string {
		if (state === 'running') return 'border-l-blue-500';
		if (state === 'done') return 'border-l-green-500';
		if (state === 'warning') return 'border-l-amber-500';
		if (state === 'error') return 'border-l-destructive';
		return 'border-l-muted-foreground/30';
	}

	function phaseDot(state: RunPhaseProgress['state']): string {
		if (state === 'running') return 'bg-blue-500';
		if (state === 'done') return 'bg-green-500';
		if (state === 'warning') return 'bg-amber-500';
		if (state === 'error') return 'bg-destructive';
		return 'bg-muted-foreground/40';
	}

	function phaseBadge(state: RunPhaseProgress['state']): string {
		if (state === 'done') return 'border-green-500/40 text-green-700 dark:text-green-300';
		if (state === 'warning') return 'border-amber-500/40 text-amber-700 dark:text-amber-300';
		if (state === 'error') return 'border-destructive/40 text-destructive';
		if (state === 'running') return 'border-blue-500/40 text-blue-700 dark:text-blue-300';
		return '';
	}

	function phaseProgressClass(state: RunPhaseProgress['state']): string {
		if (state === 'running') return '[&_[data-slot=progress-indicator]]:bg-blue-500';
		if (state === 'done') return '[&_[data-slot=progress-indicator]]:bg-green-500';
		if (state === 'warning') return '[&_[data-slot=progress-indicator]]:bg-amber-500';
		if (state === 'error') return '[&_[data-slot=progress-indicator]]:bg-destructive';
		return '[&_[data-slot=progress-indicator]]:bg-muted-foreground/50';
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
			<h1 class="text-2xl font-semibold tracking-tight">Übersicht</h1>
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
		<Card.Root class={['border-l-4 bg-card', phaseAccent(currentPhase?.state ?? 'pending')]}>
			<Card.Header class="gap-2 py-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							{#if isActive}<Spinner class="size-4 text-blue-500" />{/if}
							<Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
							<Card.Title class="text-base">{progress.headline}</Card.Title>
						</div>
						<Card.Description>
							{currentPhase?.label ?? 'Aktualisierung'} · {currentPhase?.detail ||
								progress.detail ||
								'Bereit'}
						</Card.Description>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs whitespace-nowrap text-muted-foreground">{elapsedLabel(run)}</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={progressExpanded ? 'Details einklappen' : 'Details ausklappen'}
							aria-expanded={progressExpanded}
							onclick={() => (progressExpanded = !progressExpanded)}
						>
							{#if progressExpanded}<ChevronUp class="size-4" />{:else}<ChevronDown
									class="size-4"
								/>{/if}
						</Button>
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
			{#if progressExpanded}
				<div transition:slide>
					<Card.Content class="space-y-4">
						<div class="grid gap-3">
							{#each phaseRows as phase (phase.id)}
								<div
									class={[
										'space-y-1.5 rounded-lg border border-l-2 bg-muted/40 p-3',
										phaseAccent(phase.state)
									]}
								>
									<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
										<div class="flex min-w-0 items-center gap-2">
											{#if phase.state === 'running'}<Spinner class="size-3.5" />{/if}
											<span class={['size-2 shrink-0 rounded-full', phaseDot(phase.state)]}></span>
											<span class="font-medium">{phase.label}</span>
											<Badge variant="outline" class={phaseBadge(phase.state)}>
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
									<Progress
										value={phasePercent(phase)}
										class={['h-1.5', phaseProgressClass(phase.state)]}
									/>
									{#if phase.detail}
										<p class="text-xs break-words text-muted-foreground">{phase.detail}</p>
									{/if}
								</div>
							{/each}
						</div>

						<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
							<span>Neue Stellen: {run.counts.added}</span>
							<span>Nicht mehr verfügbar: {run.counts.closed}</span>
							<span>KI-bewertete Stellen: {run.counts.ranked}</span>
							<span>Gefundene Betriebe: {run.counts.leads}</span>
							<span>
								KI-Limit: {progress.llm.requestsPerMinute} Anfragen/Minute · {progress.llm.inFlight} von
								{progress.llm.maxConcurrent} aktiv · {progress.llm.queued} warten
							</span>
							{#if run.error}<span class="text-destructive">{run.error}</span>{/if}
						</div>
					</Card.Content>
				</div>
			{/if}
		</Card.Root>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		{#each statGroups as group (group.title)}
			<section class="space-y-3">
				<h2 class="text-sm font-medium tracking-wide text-muted-foreground uppercase">
					{group.title}
				</h2>
				<div class="grid grid-cols-3 gap-3">
					{#each group.cards as card (card.label)}
						<a
							href={card.href}
							class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Card.Root
								class="h-full gap-3 py-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
							>
								<Card.Header class="gap-2">
									<span
										class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
									>
										<card.icon class="size-4" />
									</span>
									<Card.Title class="text-2xl tabular-nums sm:text-3xl">
										{card.value.toLocaleString('de-AT')}
									</Card.Title>
									<Card.Description>{card.label}</Card.Description>
								</Card.Header>
							</Card.Root>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
