<script lang="ts">
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

	const componentId = $props.id();
	const listboxId = `${componentId}-suggestions`;

	let open = $state(false);
	let suggestions = $state.raw<GeoSuggestion[]>([]);
	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let errorMessage = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let requestId = 0;
	let skipNextBlurCommit = false;

	function clearRequest(): void {
		clearTimeout(timer);
		timer = undefined;
		controller?.abort();
		controller = undefined;
	}

	function close(): void {
		clearRequest();
		open = false;
		suggestions = [];
		status = 'idle';
		errorMessage = '';
	}

	async function load(query: string, id: number, signal: AbortSignal): Promise<void> {
		status = 'loading';
		open = true;
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
		value = next;
		onInput(next);
		clearRequest();
		const query = next.trim();
		if (query.length < minLength) {
			close();
			return;
		}
		const id = ++requestId;
		status = 'loading';
		open = true;
		timer = setTimeout(() => {
			controller = new AbortController();
			void load(query, id, controller.signal);
		}, 300);
	}

	function selectSuggestion(suggestion: GeoSuggestion): void {
		value = suggestion.label;
		skipNextBlurCommit = true;
		onSelect(suggestion);
		close();
	}

	function selectFromPointer(event: PointerEvent, suggestion: GeoSuggestion): void {
		event.preventDefault();
		selectSuggestion(suggestion);
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

<div class="relative">
	<Input
		role="combobox"
		aria-label={label}
		aria-autocomplete="list"
		aria-controls={listboxId}
		aria-expanded={open}
		autocomplete="off"
		{placeholder}
		{value}
		oninput={(event) => handleInput(event.currentTarget.value)}
		onfocus={() => {
			if (suggestions.length > 0 || status !== 'idle') open = true;
		}}
		onblur={handleBlur}
	/>

	{#if open}
		<div
			id={listboxId}
			role="listbox"
			class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if status === 'loading'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">Vorschläge werden geladen ...</div>
			{:else if status === 'error'}
				<div class="px-2 py-1.5 text-sm text-muted-foreground">
					{errorMessage}
				</div>
			{:else if suggestions.length === 0}
				<div class="px-2 py-1.5 text-sm text-destructive">
					{kind === 'address'
						? 'Adresse ungültig. Wähle eine Adresse aus den Vorschlägen aus.'
						: 'Keine Vorschläge gefunden.'}
				</div>
			{:else}
				{#each suggestions as suggestion (suggestion.id)}
					<button
						type="button"
						role="option"
						aria-selected={false}
						class="block w-full min-w-0 overflow-hidden rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
						onpointerdown={(event) => selectFromPointer(event, suggestion)}
						onclick={() => selectSuggestion(suggestion)}
					>
						<span class="block truncate">{suggestion.label}</span>
						{#if suggestion.secondaryLabel}
							<span class="block truncate text-xs text-muted-foreground">
								{suggestion.secondaryLabel}
							</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
