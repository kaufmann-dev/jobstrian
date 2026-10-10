<script lang="ts">
	import { cn } from '#lib/utils.js';
	import type { PersonOverview } from '#lib/server/applications/service.js';

	type Props = {
		overview: Pick<PersonOverview, 'activeSearch' | 'bucketCounts' | 'sent' | 'upcoming'>;
		class?: string;
	};

	let { overview, class: className }: Props = $props();

	const maxSteps = 3;
	const dateFormat = new Intl.DateTimeFormat('de-AT', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const responded = $derived(overview.bucketCounts.responded);
	const silent = $derived(overview.bucketCounts.ghosted + overview.bucketCounts.waiting);
	const steps = $derived(overview.upcoming.slice(0, maxSteps));
	const hiddenSteps = $derived(Math.max(0, overview.upcoming.length - maxSteps));

	function formatDay(day: string): string {
		return dateFormat.format(new Date(`${day}T00:00:00Z`));
	}
</script>

<div class={cn('space-y-3', className)}>
	{#if overview.activeSearch}
		<p class="truncate text-xs text-muted-foreground">
			Laufende Suche · {overview.activeSearch.title}
		</p>
		<div class="flex items-baseline gap-2">
			<span class="text-4xl font-semibold tabular-nums">{responded.toLocaleString('de-AT')}</span>
			<span class="text-sm font-medium">Rückmeldungen</span>
		</div>
		{#if steps.length > 0}
			<ul class="space-y-1.5 text-sm" aria-label="Nächste Schritte">
				{#each steps as step (step.applicationId)}
					<li class="flex items-baseline justify-between gap-3">
						<span class="min-w-0 truncate">
							{step.companyName}{step.nextStepNote ? ` · ${step.nextStepNote}` : ''}
						</span>
						<span
							class={[
								'shrink-0 text-xs tabular-nums',
								step.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
							]}
						>
							{#if step.overdue}überfällig ·
							{/if}{formatDay(step.nextStepOn)}
						</span>
					</li>
				{/each}
			</ul>
			{#if hiddenSteps > 0}
				<p class="text-xs text-muted-foreground">+ {hiddenSteps} weitere Schritte</p>
			{/if}
		{/if}
		<p class="text-xs text-muted-foreground">
			{overview.sent.toLocaleString('de-AT')} beworben · {silent.toLocaleString('de-AT')} ohne Antwort
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">Keine laufende Suche</p>
	{/if}
</div>
