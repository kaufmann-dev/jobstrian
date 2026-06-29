<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { BadgeVariant } from '$lib/components/ui/badge/index.js';

	export type RunStatusCardPhaseState =
		| 'pending'
		| 'running'
		| 'done'
		| 'warning'
		| 'skipped'
		| 'error'
		| 'canceled';

	export type RunStatusCardPhase = {
		id: string;
		label: string;
		state: RunStatusCardPhaseState;
		current: number;
		total: number;
		detail: string;
		skipped: number;
		failed: number;
	};

	type Props = {
		title: string;
		statusLabel: string;
		statusVariant?: BadgeVariant;
		meta?: string;
		summary?: string;
		active?: boolean;
		defaultExpanded?: boolean;
		open?: boolean;
		phases?: RunStatusCardPhase[];
		actions?: Snippet;
		metrics?: Snippet;
		details?: Snippet;
		footer?: Snippet;
	};
</script>

<script lang="ts">
	import { slide } from 'svelte/transition';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let {
		title,
		statusLabel,
		statusVariant = 'secondary',
		meta,
		summary,
		active = false,
		defaultExpanded = false,
		open = $bindable(defaultExpanded),
		phases = [],
		actions,
		metrics,
		details,
		footer
	}: Props = $props();

	const hasExpandableContent = $derived(phases.length > 0 || Boolean(details) || Boolean(footer));
	const compactProgressPhase = $derived(phases.find((phase) => phase.state === 'running'));

	function phaseStateLabel(state: RunStatusCardPhaseState): string {
		if (state === 'running') return 'läuft';
		if (state === 'done') return 'fertig';
		if (state === 'warning') return 'mit Warnung fertig';
		if (state === 'skipped') return 'übersprungen';
		if (state === 'error') return 'Fehler';
		if (state === 'canceled') return 'abgebrochen';
		return 'wartet';
	}

	function phasePercent(phase: RunStatusCardPhase): number {
		if (phase.total <= 0) return phase.state === 'done' || phase.state === 'skipped' ? 100 : 0;
		return Math.round((Math.min(phase.current, phase.total) / phase.total) * 100);
	}
</script>

<Collapsible.Root bind:open>
	<Card.Root class="gap-0 overflow-visible rounded-2xl py-0">
		<Card.Header class="gap-4 px-4 py-4 sm:px-5">
			<div class="min-w-0 space-y-3">
				<Card.Title class="truncate text-base leading-tight font-semibold">{title}</Card.Title>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					{#if active}<Spinner class="size-4 shrink-0 text-primary" />{/if}
					<Badge class="shrink-0" variant={statusVariant}>{statusLabel}</Badge>
					{#if meta}
						<span class="text-xs whitespace-nowrap text-muted-foreground">{meta}</span>
					{/if}
				</div>
				{#if summary}
					<Card.Description class="line-clamp-2 text-sm leading-snug">{summary}</Card.Description>
				{/if}
			</div>

			{#if compactProgressPhase && compactProgressPhase.total > 1}
				<div class="space-y-1.5">
					<Progress
						value={phasePercent(compactProgressPhase)}
						class="h-1.5"
						aria-label={`${compactProgressPhase.label}: ${phasePercent(compactProgressPhase)} Prozent`}
					/>
					<div
						class="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground"
					>
						<span class="truncate">{compactProgressPhase.label}</span>
						<span class="shrink-0 tabular-nums">
							{compactProgressPhase.current} / {compactProgressPhase.total}
						</span>
					</div>
				</div>
			{/if}

			{#if metrics}
				<div class="rounded-xl bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
					{@render metrics()}
				</div>
			{/if}

			{#if actions || hasExpandableContent}
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
						{@render actions?.()}
					</div>
					{#if hasExpandableContent}
						<Collapsible.Trigger
							class={buttonVariants({
								variant: 'ghost',
								size: 'default',
								class: 'w-full justify-center sm:w-auto sm:shrink-0'
							})}
							aria-expanded={open}
						>
							{#if open}
								<ChevronUp class="size-4" />
								Details ausblenden
							{:else}
								<ChevronDown class="size-4" />
								Details anzeigen
							{/if}
						</Collapsible.Trigger>
					{/if}
				</div>
			{/if}
		</Card.Header>
		{#if hasExpandableContent}
			<Collapsible.Content>
				{#if open}
					<div transition:slide>
						<Card.Content class="space-y-4">
							{#if phases.length > 0}
								<ul class="divide-y">
									{#each phases as phase (phase.id)}
										<li class="space-y-1.5 py-2 text-sm first:pt-0 last:pb-0">
											<div class="flex items-center justify-between gap-3">
												<div class="flex min-w-0 items-center gap-2.5">
													{#if phase.state === 'running'}
														<Spinner class="size-4 shrink-0 text-primary" />
													{:else if phase.state === 'done'}
														<Check class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
													{:else if phase.state === 'warning'}
														<TriangleAlert
															class="size-4 shrink-0 text-amber-600 dark:text-amber-400"
														/>
													{:else if phase.state === 'error' || phase.state === 'canceled'}
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
														>{/if}{#if phase.failed > 0 && phase.skipped > 0}
														·
													{/if}{#if phase.skipped > 0}{phase.skipped}
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
							{/if}

							{@render details?.()}
							{@render footer?.()}
						</Card.Content>
					</div>
				{/if}
			</Collapsible.Content>
		{/if}
	</Card.Root>
</Collapsible.Root>
