<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description: string;
		actions?: Snippet;
		status?: Snippet;
	}

	let { title, description, actions, status }: Props = $props();
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
		<p class="text-sm text-muted-foreground">{description}</p>
	</div>
	{#if status || actions}
		<div class="flex flex-col gap-2 sm:shrink-0 sm:items-end">
			{@render status?.()}
			{@render actions?.()}
		</div>
	{/if}
</div>
