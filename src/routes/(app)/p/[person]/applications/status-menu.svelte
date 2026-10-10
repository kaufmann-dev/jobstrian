<script lang="ts">
	import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '#lib/applications.js';
	import {
		buttonVariants,
		type ButtonSize,
		type ButtonVariant
	} from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { STATUS_MENU_ORDER } from './application-helpers.js';

	interface Props {
		current: ApplicationStatus;
		company: string;
		onpick: (status: ApplicationStatus) => void;
		/** Icon-only trigger for dense rows. */
		compact?: boolean;
		variant?: ButtonVariant;
		size?: ButtonSize;
	}

	let {
		current,
		company,
		onpick,
		compact = false,
		variant = 'outline',
		size = 'sm'
	}: Props = $props();

	const options = $derived(STATUS_MENU_ORDER.filter((status) => status !== current));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant, size: compact ? 'icon-sm' : size })}
		aria-label={compact ? `Status ändern: ${company}` : undefined}
	>
		{#if compact}
			<Ellipsis />
		{:else}
			Status ändern
			<ChevronDown />
		{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-52">
		<DropdownMenu.Label>Status ändern</DropdownMenu.Label>
		{#each options as status (status)}
			<DropdownMenu.Item onSelect={() => onpick(status)}>
				{APPLICATION_STATUS_LABELS[status]}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
