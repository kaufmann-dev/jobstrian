<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();
</script>

<PaginationPrimitive.NextButton
	bind:ref
	aria-label="Zur nächsten Seite"
	class={cn(buttonVariants({ variant: 'ghost', size: 'default' }), 'pr-1.5!', className)}
	{...restProps}
>
	<span class="cn-pagination-next-text hidden sm:block">Weiter</span>
	<ChevronRightIcon data-icon="inline-end" />
</PaginationPrimitive.NextButton>
