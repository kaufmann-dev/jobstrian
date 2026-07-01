<script lang="ts" module>
	import type { Component, Snippet } from 'svelte';
	import type { LucideProps } from '@lucide/svelte';
	import type { ButtonVariant } from '$lib/components/ui/button/index.js';

	export type ConfirmDialogAction = {
		label: string;
		onclick: () => void;
		variant?: ButtonVariant;
		icon?: Component<LucideProps>;
		loading?: boolean;
		disabled?: boolean;
	};
</script>

<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	type Props = {
		open: boolean;
		title: string;
		description?: Snippet;
		info?: Snippet;
		cancelLabel?: string;
		actions: ConfirmDialogAction[];
	};

	let {
		open = $bindable(),
		title,
		description,
		info,
		cancelLabel = 'Abbrechen',
		actions
	}: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{@render description()}</Dialog.Description>
			{/if}
		</Dialog.Header>
		{#if info}
			<div class="rounded-lg border p-3 text-sm text-muted-foreground">
				{@render info()}
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{cancelLabel}</Button>
			{#each actions as action (action.label)}
				<Button
					variant={action.variant}
					disabled={action.disabled || action.loading}
					onclick={action.onclick}
				>
					{#if action.loading}
						<Spinner />
					{:else if action.icon}
						{@const Icon = action.icon}
						<Icon />
					{/if}
					{action.label}
				</Button>
			{/each}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
