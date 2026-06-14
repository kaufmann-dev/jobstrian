<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import X from '@lucide/svelte/icons/x';

	let {
		values,
		label,
		placeholder,
		onValuesChange
	}: {
		values: string[];
		label: string;
		placeholder: string;
		onValuesChange: (values: string[]) => void;
	} = $props();

	let inputValue = $state('');

	function parseValues(raw: string): string[] {
		return raw
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function normalizeValues(items: readonly string[]): string[] {
		return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
	}

	function commitInput(): void {
		const additions = parseValues(inputValue);
		if (additions.length === 0) {
			inputValue = '';
			return;
		}
		onValuesChange(normalizeValues([...values, ...additions]));
		inputValue = '';
	}

	function removeValue(value: string): void {
		onValuesChange(values.filter((item) => item !== value));
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ',') return;
		event.preventDefault();
		commitInput();
	}
</script>

<div class="space-y-2">
	{#if values.length > 0}
		<div class="flex flex-wrap gap-2" aria-label={`${label} Einträge`}>
			{#each values as value (value)}
				<Badge variant="secondary" class="gap-1">
					{value}
					<Button
						variant="ghost"
						size="icon-xs"
						class="-mr-1 size-4 rounded-full"
						aria-label={`${value} entfernen`}
						onclick={() => removeValue(value)}
					>
						<X class="size-3" />
					</Button>
				</Badge>
			{/each}
		</div>
	{/if}
	<Input
		value={inputValue}
		oninput={(event) => (inputValue = event.currentTarget.value)}
		onkeydown={onKeydown}
		onblur={commitInput}
		aria-label={`${label} hinzufügen`}
		{placeholder}
	/>
</div>
