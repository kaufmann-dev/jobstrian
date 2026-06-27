<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	interface Props {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		children: Snippet;
	}

	let { checked, onCheckedChange, children }: Props = $props();
</script>

<label class="flex min-h-10 items-center gap-2 rounded-2xl bg-input/35 px-3 text-sm lg:min-h-8">
	<Checkbox {checked} {onCheckedChange} />
	{@render children()}
</label>
