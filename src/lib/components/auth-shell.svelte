<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Briefcase from '@lucide/svelte/icons/briefcase';

	interface Props {
		title: string;
		description: string;
		children: Snippet;
	}

	let { title, description, children }: Props = $props();
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
	<div class="flex items-center gap-3">
		<span
			class="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
		>
			<Briefcase class="size-5.5" />
		</span>
		<span class="text-2xl font-semibold tracking-tight">Jobstrian</span>
	</div>
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>{title}</Card.Title>
			<Card.Description>{description}</Card.Description>
		</Card.Header>
		{@render children()}
	</Card.Root>
</div>
