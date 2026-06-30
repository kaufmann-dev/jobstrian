<script lang="ts">
	import { Progress } from '$lib/components/ui/progress/index.js';
	import type { RankFactor } from '$lib/ranking-criteria';

	let { factors }: { factors: RankFactor[] } = $props();
</script>

<div class="space-y-3">
	<h3 class="text-sm font-medium">Bewertung</h3>
	<ul class="space-y-2.5">
		{#each factors as factor (factor.id)}
			<li class="space-y-1">
				<div class="flex items-center justify-between gap-2 text-sm">
					<span>{factor.label}</span>
					<span class="text-muted-foreground tabular-nums">{factor.score}/5</span>
				</div>
				<Progress value={factor.score} max={5} />
			</li>
		{/each}
	</ul>
</div>
