<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import logo from '#lib/assets/favicon.svg';

	interface Props {
		title: string;
		description: string;
		children: Snippet;
	}

	let { title, description, children }: Props = $props();
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
	<div class="flex items-center gap-3">
		<img src={logo} alt="" class="size-11" />
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
