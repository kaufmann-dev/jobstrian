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

	export type RunStatusCardFailureReason = {
		code: string;
		label: string;
		count: number;
	};

	export type RunStatusCardPhase = {
		id: string;
		label: string;
		state: RunStatusCardPhaseState;
		current: number;
		total: number;
		detail: string;
		skipped: number;
		failed: number;
		failureReasons?: RunStatusCardFailureReason[];
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
		details?: Snippet;
		footer?: Snippet;
	};
</script>

<script lang="ts">
	import { slide } from 'svelte/transition';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
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
		details,
		footer
	}: Props = $props();

	const hasExpandableContent = $derived(phases.length > 0 || Boolean(details) || Boolean(footer));
	const activePhase = $derived(phases.find((phase) => phase.state === 'running'));

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
	<Card.Root class="gap-0 py-0">
		<div class="px-5 py-4">
			<div class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
				<div class="order-1 flex min-w-0 flex-1 items-center gap-2">
					{#if active}<Spinner class="size-4 shrink-0 text-primary" />{/if}
					<Card.Title class="min-w-0 truncate text-base leading-snug">{title}</Card.Title>
				</div>

				{#if meta || actions}
					<div class="order-2 flex shrink-0 items-center gap-2 sm:order-3">
						{#if meta}
							<span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
								>{meta}</span
							>
						{/if}
						{@render actions?.()}
					</div>
				{/if}

				<div class="order-3 min-w-0 basis-full sm:order-2 sm:basis-auto">
					{#if active && activePhase}
						<div class="flex flex-col gap-1.5 sm:w-64 sm:flex-row sm:items-center sm:gap-3">
							<div class="flex items-center justify-between gap-2 sm:contents">
								<span class="truncate text-sm font-medium sm:order-1 sm:shrink-0">
									{activePhase.label}
								</span>
								<span
									class="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:order-3"
								>
									{activePhase.current} / {activePhase.total}
								</span>
							</div>
							{#if activePhase.total > 1}
								<Progress value={phasePercent(activePhase)} class="h-1 sm:order-2 sm:flex-1" />
							{/if}
						</div>
					{:else if active && summary}
						<p class="truncate text-sm text-muted-foreground sm:max-w-xs">{summary}</p>
					{:else if !active}
						<div class="flex min-w-0 items-center gap-2 sm:max-w-sm">
							<Badge class="shrink-0" variant={statusVariant}>{statusLabel}</Badge>
							{#if summary}
								<span class="truncate text-sm text-muted-foreground">{summary}</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
		{#if hasExpandableContent}
			<Collapsible.Content>
				{#if open}
					<div transition:slide>
						<div class="space-y-4 border-t px-5 pt-4 pb-2">
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
											{#if phase.failed > 0 && phase.failureReasons?.length}
												<ul class="pl-[26px] text-xs text-muted-foreground">
													{#each phase.failureReasons as reason (reason.code)}
														<li
															class={reason.code === 'payment' || reason.code === 'auth'
																? 'font-medium text-amber-600 dark:text-amber-400'
																: undefined}
														>
															{reason.count}× {reason.label}
														</li>
													{/each}
												</ul>
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
						</div>
					</div>
				{/if}
			</Collapsible.Content>

			<Collapsible.Trigger
				class="flex w-full items-center justify-center py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
				aria-label={open ? 'Details einklappen' : 'Details ausklappen'}
				aria-expanded={open}
			>
				<ChevronDown class={['size-4 transition-transform duration-200', open && 'rotate-180']} />
			</Collapsible.Trigger>
		{/if}
	</Card.Root>
</Collapsible.Root>
