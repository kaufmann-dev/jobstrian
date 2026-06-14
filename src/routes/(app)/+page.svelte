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
	import Check from '@lucide/svelte/icons/check';
	import CircleX from '@lucide/svelte/icons/circle-x';
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
	const totalFailed = $derived(phaseRows.reduce((sum, phase) => sum + phase.failed, 0));

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
		<Card.Root>
			<Card.Header class="gap-2 py-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						{#if isActive}<Spinner class="size-4 text-primary" />{/if}
						<Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
						<Card.Title class="text-base">{progress.headline}</Card.Title>
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
				{#if isActive}
					<Card.Description>
						{currentPhase?.label ?? 'Aktualisierung'} · {currentPhase?.detail ||
							progress.detail ||
							'Bereit'}
					</Card.Description>
				{:else if totalFailed > 0}
					<Card.Description class="text-amber-600 dark:text-amber-400">
						{totalFailed}
						{totalFailed === 1 ? 'Bewertung' : 'Bewertungen'} fehlgeschlagen.
					</Card.Description>
				{/if}
			</Card.Header>
			{#if progressExpanded}
				<div transition:slide>
					<Card.Content class="space-y-4">
						<ul class="divide-y">
							{#each phaseRows as phase (phase.id)}
								<li class="space-y-1.5 py-2 text-sm first:pt-0 last:pb-0">
									<div class="flex items-center justify-between gap-3">
										<div class="flex min-w-0 items-center gap-2.5">
											{#if phase.state === 'running'}
												<Spinner class="size-4 shrink-0 text-primary" />
											{:else if phase.state === 'done'}
												<Check class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
											{:else if phase.state === 'warning'}
												<TriangleAlert class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
											{:else if phase.state === 'error'}
												<CircleX class="size-4 shrink-0 text-destructive" />
											{:else}
												<span class="mx-1 size-2 shrink-0 rounded-full bg-muted-foreground/30"
												></span>
											{/if}
											<span
												class={[
													'truncate',
													phase.state === 'pending' || phase.state === 'skipped'
														? 'text-muted-foreground'
														: 'font-medium'
												]}
											>
												{phase.label}
											</span>
											<span class="sr-only">{phaseStateLabel(phase.state)}</span>
										</div>
										<span
											class="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
										>
											{phase.current} / {phase.total}
										</span>
									</div>
									{#if phase.failed > 0 || phase.skipped > 0}
										<p class="pl-[26px] text-xs text-muted-foreground">
											{#if phase.failed > 0}<span class="text-amber-600 dark:text-amber-400"
													>{phase.failed} fehlgeschlagen</span
												>{/if}{#if phase.failed > 0 && phase.skipped > 0}{' · '}{/if}{#if phase.skipped > 0}{phase.skipped}
												übersprungen{/if}
										</p>
									{/if}
									{#if phase.state === 'running'}
										{#if phase.total > 1}
											<Progress value={phasePercent(phase)} class="h-1" />
										{/if}
										{#if phase.detail}
											<p class="text-xs break-words text-muted-foreground">{phase.detail}</p>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>

						<p class="border-t pt-3 text-sm text-muted-foreground">
							{run.counts.added} neue Stellen · {run.counts.closed} nicht mehr verfügbar · {run
								.counts.ranked} bewertet · {run.counts.leads} Betriebe gefunden
							{#if isActive}
								· KI: {progress.llm.inFlight} aktiv, {progress.llm.queued} warten
							{/if}
						</p>
						{#if run.error}
							<p class="text-sm text-destructive">{run.error}</p>
						{/if}
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
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{#each group.cards as card (card.label)}
						<a
							href={card.href}
							class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Card.Root
								class="h-full py-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:py-5"
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
									<Card.Description>{card.label}</Card.Description>
								</div>
							</Card.Root>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
