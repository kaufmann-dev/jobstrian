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
	let selectedValue = $state('');
	let suggestions = $state.raw<GeoSuggestion[]>([]);
	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let errorMessage = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let requestId = 0;
	let skipNextBlurCommit = false;

	function close(): void {
		clearTimeout(timer);
		controller?.abort();
		open = false;
		suggestions = [];
		status = 'idle';
		errorMessage = '';
	}

	async function load(query: string, id: number, signal: AbortSignal): Promise<void> {
		status = 'loading';
		try {
			const response = await fetch(
				`/api/geo/suggestions?kind=${kind}&q=${encodeURIComponent(query)}`,
				{ signal }
			);
			const body = (await response.json()) as {
				code?: string;
				message?: string;
				suggestions?: GeoSuggestion[];
			};
			if (!response.ok) throw new Error(body.message ?? 'Vorschläge sind nicht verfügbar.');
			if (id !== requestId) return;
			suggestions = body.suggestions ?? [];
			status = 'idle';
			open = true;
		} catch (error) {
			if (signal.aborted || id !== requestId) return;
			suggestions = [];
			status = 'error';
			errorMessage =
				error instanceof Error ? error.message : 'Vorschläge sind vorübergehend nicht verfügbar.';
			open = true;
		}
	}

	function handleInput(next: string): void {
		selectedValue = '';
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
		selectSuggestion(suggestion);
	}

	function selectSuggestion(suggestion: GeoSuggestion): void {
		value = suggestion.label;
		selectedValue = suggestion.id;
		skipNextBlurCommit = true;
		onSelect(suggestion);
		close();
	}

	function handleBlur(): void {
		if (skipNextBlurCommit) {
			skipNextBlurCommit = false;
			return;
		}
		const exactSuggestion = suggestions.find(
			(suggestion) => suggestion.verifiable && suggestion.label.trim() === value.trim()
		);
		if (exactSuggestion) {
			selectSuggestion(exactSuggestion);
			return;
		}
		close();
		onBlur?.();
	}
</script>

<Combobox.Root
	type="single"
	{open}
	bind:value={selectedValue}
	allowDeselect={false}
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
			collisionPadding={8}
			class="z-50 max-h-60 w-(--bits-combobox-anchor-width) max-w-[calc(100vw-1rem)] overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if status === 'loading'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">Vorschläge werden geladen …</div>
			{:else if status === 'error'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">
					{errorMessage}
				</div>
			{:else if suggestions.length === 0}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">Keine Vorschläge gefunden.</div>
			{:else}
				<Combobox.Viewport>
					{#each suggestions as suggestion (suggestion.id)}
						<Combobox.Item
							value={suggestion.id}
							label={suggestion.label}
							class="min-w-0 overflow-hidden rounded-lg px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted"
						>
							{#snippet child({ props })}
								<div {...props} onpointerdowncapture={() => selectSuggestion(suggestion)}>
									<span class="block truncate">{suggestion.label}</span>
									{#if suggestion.secondaryLabel}
										<span class="block truncate text-xs text-muted-foreground">
											{suggestion.secondaryLabel}
										</span>
									{/if}
								</div>
							{/snippet}
						</Combobox.Item>
					{/each}
				</Combobox.Viewport>
			{/if}
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
