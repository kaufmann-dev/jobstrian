<script lang="ts">
	import { Combobox } from 'bits-ui';
	import type { GeoSuggestion, GeoSuggestionKind } from '$lib/geo';
	import { Input } from '$lib/components/ui/input/index.js';

	let {
		kind,
		value = $bindable(''),
		label,
		placeholder,
		minLength = kind === 'address' ? 3 : 2,
		onInput,
		onSelect,
		onBlur
	}: {
		kind: GeoSuggestionKind;
		value?: string;
		label: string;
		placeholder: string;
		minLength?: number;
		onInput: (value: string) => void;
		onSelect: (suggestion: GeoSuggestion) => void;
		onBlur?: () => void;
	} = $props();

	let open = $state(false);
	let suggestions = $state.raw<GeoSuggestion[]>([]);
	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let requestId = 0;

	function close(): void {
		clearTimeout(timer);
		controller?.abort();
		open = false;
		suggestions = [];
		status = 'idle';
	}

	async function load(query: string, id: number, signal: AbortSignal): Promise<void> {
		status = 'loading';
		try {
			const response = await fetch(
				`/api/geo/suggestions?kind=${kind}&q=${encodeURIComponent(query)}`,
				{ signal }
			);
			if (!response.ok) throw new Error('lookup failed');
			const body = (await response.json()) as { suggestions?: GeoSuggestion[] };
			if (id !== requestId) return;
			suggestions = body.suggestions ?? [];
			status = 'idle';
			open = true;
		} catch {
			if (signal.aborted || id !== requestId) return;
			suggestions = [];
			status = 'error';
			open = true;
		}
	}

	function handleInput(next: string): void {
		value = next;
		onInput(next);
		clearTimeout(timer);
		controller?.abort();
		const query = next.trim();
		if (query.length < minLength) {
			close();
			return;
		}
		const id = ++requestId;
		timer = setTimeout(() => {
			controller = new AbortController();
			void load(query, id, controller.signal);
		}, 300);
	}

	function select(id: string): void {
		const suggestion = suggestions.find((item) => item.id === id);
		if (!suggestion) return;
		value = suggestion.label;
		onSelect(suggestion);
		close();
	}

	function handleBlur(): void {
		setTimeout(() => {
			close();
			onBlur?.();
		});
	}
</script>

<Combobox.Root
	type="single"
	{open}
	onOpenChange={(next) => (open = next)}
	onValueChange={(selected) => select(selected)}
	items={suggestions.map((suggestion) => ({ value: suggestion.id, label: suggestion.label }))}
	inputValue={value}
>
	<Combobox.Input>
		{#snippet child({ props })}
			<Input
				{...props}
				{value}
				oninput={(event) => handleInput(event.currentTarget.value)}
				onfocus={() => suggestions.length > 0 && (open = true)}
				onblur={handleBlur}
				aria-label={label}
				autocomplete="off"
				{placeholder}
			/>
		{/snippet}
	</Combobox.Input>
	<Combobox.Portal>
		<Combobox.Content
			class="z-50 max-h-60 min-w-(--bits-combobox-anchor-width) overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if status === 'loading'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">Vorschläge werden geladen …</div>
			{:else if status === 'error'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">
					Vorschläge sind vorübergehend nicht verfügbar.
				</div>
			{:else if suggestions.length === 0}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">Keine Vorschläge gefunden.</div>
			{:else}
				<Combobox.Viewport>
					{#each suggestions as suggestion (suggestion.id)}
						<Combobox.Item
							value={suggestion.id}
							label={suggestion.label}
							class="rounded-lg px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted"
						>
							<span class="block">{suggestion.label}</span>
							{#if suggestion.secondaryLabel}
								<span class="block text-xs text-muted-foreground">{suggestion.secondaryLabel}</span>
							{/if}
						</Combobox.Item>
					{/each}
				</Combobox.Viewport>
			{/if}
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
