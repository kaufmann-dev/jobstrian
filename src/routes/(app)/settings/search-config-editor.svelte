<script lang="ts">
	import {
		normalizeOsmBusinessTags,
		osmBusinessTagLabel,
		osmBusinessTagRaw,
		parseOsmBusinessTag,
		type OsmBusinessTag,
		type OsmBusinessTagSuggestion,
		type SearchConfig,
		type SearchConfigField
	} from '$lib/search-config';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import X from '@lucide/svelte/icons/x';

	type CitySuggestion = {
		label: string;
		city: string | null;
		postcode: string | null;
		placeId: number | null;
	};

	let {
		config = $bindable(),
		fields,
		selected = $bindable([])
	}: {
		config: SearchConfig;
		fields?: SearchConfigField[];
		selected?: SearchConfigField[];
	} = $props();

	const allFields: SearchConfigField[] = [
		'jobSearchKeywords',
		'jobSearchLocations',
		'businessOsmTags',
		'businessRadiusMeters'
	];
	const visibleFields = $derived(fields ?? allFields);
	const selectable = $derived(Boolean(fields));
	let cityInput = $state('');
	let citySuggestions = $state.raw<CitySuggestion[]>([]);
	let cityLookupStatus = $state<'idle' | 'loading' | 'error'>('idle');
	let citySuggestionTimer: ReturnType<typeof setTimeout> | undefined;
	let citySuggestionController: AbortController | undefined;
	let citySuggestionRequest = 0;
	let tagInput = $state('');
	let tagInputError = $state('');
	let tagSuggestions = $state.raw<OsmBusinessTagSuggestion[]>([]);
	let tagLookupStatus = $state<'idle' | 'loading' | 'error'>('idle');
	let tagSuggestionTimer: ReturnType<typeof setTimeout> | undefined;
	let tagSuggestionController: AbortController | undefined;
	let tagSuggestionRequest = 0;

	function visible(field: SearchConfigField): boolean {
		return visibleFields.includes(field);
	}

	function selection(field: SearchConfigField, checked: boolean) {
		selected = checked
			? [...new Set([...selected, field])]
			: selected.filter((item) => item !== field);
	}

	function parseList(value: string): string[] {
		return [
			...new Set(
				value
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean)
			)
		];
	}

	function setField<Field extends keyof SearchConfig>(field: Field, value: SearchConfig[Field]) {
		config = { ...config, [field]: value };
	}

	function addCity(city: string) {
		const normalized = city.trim();
		if (!normalized) return;
		setField('jobSearchLocations', [...new Set([...config.jobSearchLocations, normalized])]);
		cityInput = '';
		citySuggestions = [];
		cityLookupStatus = 'idle';
	}

	function removeCity(city: string) {
		setField(
			'jobSearchLocations',
			config.jobSearchLocations.filter((item) => item !== city)
		);
	}

	async function loadCitySuggestions(query: string, requestId: number, signal: AbortSignal) {
		try {
			cityLookupStatus = 'loading';
			const response = await fetch(`/api/geo/city-suggestions?q=${encodeURIComponent(query)}`, {
				signal
			});
			if (!response.ok) throw new Error('City suggestions failed');
			const body = (await response.json()) as { suggestions?: CitySuggestion[] };
			if (requestId !== citySuggestionRequest) return;
			citySuggestions = body.suggestions ?? [];
			cityLookupStatus = 'idle';
		} catch (error) {
			if (signal.aborted) return;
			citySuggestions = [];
			cityLookupStatus = 'error';
		}
	}

	function scheduleCitySuggestions(query: string) {
		clearTimeout(citySuggestionTimer);
		citySuggestionController?.abort();

		const trimmed = query.trim();
		if (trimmed.length < 2) {
			citySuggestions = [];
			cityLookupStatus = 'idle';
			return;
		}

		const requestId = ++citySuggestionRequest;
		citySuggestionTimer = setTimeout(() => {
			citySuggestionController = new AbortController();
			void loadCitySuggestions(trimmed, requestId, citySuggestionController.signal);
		}, 250);
	}

	function onCityInput(value: string) {
		cityInput = value;
		scheduleCitySuggestions(value);
	}

	function onCityKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ',') return;
		event.preventDefault();
		addCity(cityInput);
	}

	function addTag(tag: OsmBusinessTag) {
		setField('businessOsmTags', normalizeOsmBusinessTags([...config.businessOsmTags, tag]));
		tagInput = '';
		tagInputError = '';
		tagSuggestions = [];
		tagLookupStatus = 'idle';
	}

	function addTypedTag() {
		const trimmed = tagInput.trim();
		if (!trimmed) return;
		const tag = parseOsmBusinessTag(trimmed);
		if (!tag) {
			tagInputError =
				'OSM-Kategorie muss als gültiges key=value aus dem Katalog eingegeben werden.';
			return;
		}
		addTag(tag);
	}

	function removeTag(tag: OsmBusinessTag) {
		setField(
			'businessOsmTags',
			config.businessOsmTags.filter((item) => !(item.key === tag.key && item.value === tag.value))
		);
	}

	async function loadTagSuggestions(query: string, requestId: number, signal: AbortSignal) {
		try {
			tagLookupStatus = 'loading';
			const response = await fetch(`/api/osm-tag-suggestions?q=${encodeURIComponent(query)}`, {
				signal
			});
			if (!response.ok) throw new Error('OSM tag suggestions failed');
			const body = (await response.json()) as { suggestions?: OsmBusinessTagSuggestion[] };
			if (requestId !== tagSuggestionRequest) return;
			tagSuggestions = body.suggestions ?? [];
			tagLookupStatus = 'idle';
		} catch (error) {
			if (signal.aborted) return;
			tagSuggestions = [];
			tagLookupStatus = 'error';
		}
	}

	function scheduleTagSuggestions(query: string) {
		clearTimeout(tagSuggestionTimer);
		tagSuggestionController?.abort();

		const trimmed = query.trim();
		if (trimmed.length < 2) {
			tagSuggestions = [];
			tagLookupStatus = 'idle';
			return;
		}

		const requestId = ++tagSuggestionRequest;
		tagSuggestionTimer = setTimeout(() => {
			tagSuggestionController = new AbortController();
			void loadTagSuggestions(trimmed, requestId, tagSuggestionController.signal);
		}, 250);
	}

	function onTagInput(value: string) {
		tagInput = value;
		tagInputError = '';
		scheduleTagSuggestions(value);
	}

	function onTagKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ',') return;
		event.preventDefault();
		addTypedTag();
	}
</script>

{#snippet heading(field: SearchConfigField, label: string)}
	<div class="flex items-center gap-2">
		{#if selectable}
			<Checkbox
				checked={selected.includes(field)}
				onCheckedChange={(checked) => selection(field, checked === true)}
				aria-label={`${label} übernehmen`}
			/>
		{/if}
		<h3 class="text-sm font-medium">{label}</h3>
	</div>
{/snippet}

<div class="space-y-5">
	{#if visible('jobSearchKeywords')}
		<div class="space-y-2">
			{@render heading('jobSearchKeywords', 'Stellen-Keywords')}
			<Input
				value={config.jobSearchKeywords.join(', ')}
				onchange={(event) =>
					setField('jobSearchKeywords', parseList((event.currentTarget as HTMLInputElement).value))}
				placeholder="Pflegeassistenz, Verkauf, Office"
			/>
		</div>
	{/if}

	{#if visible('jobSearchLocations')}
		<div class="space-y-2">
			{@render heading('jobSearchLocations', 'Job-Suchorte')}
			<div class="flex flex-wrap gap-2">
				{#each config.jobSearchLocations as city (city)}
					<Badge variant="secondary" class="gap-1">
						{city}
						<Button
							variant="ghost"
							size="icon-xs"
							class="-mr-1 size-4 rounded-full"
							aria-label={`${city} entfernen`}
							onclick={() => removeCity(city)}
						>
							<X class="size-3" />
						</Button>
					</Badge>
				{/each}
			</div>
			<div class="relative">
				<Input
					value={cityInput}
					oninput={(event) => onCityInput(event.currentTarget.value)}
					onkeydown={onCityKeydown}
					onblur={() => addCity(cityInput)}
					aria-expanded={citySuggestions.length > 0}
					aria-label="Job-Suchort hinzufügen"
					placeholder="Wien, Graz, Linz"
				/>
				{#if citySuggestions.length > 0}
					<div
						class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
					>
						{#each citySuggestions as suggestion (suggestion.placeId ?? suggestion.label)}
							<button
								type="button"
								class="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
								onmousedown={(event) => {
									event.preventDefault();
									addCity(suggestion.city ?? suggestion.label);
								}}
							>
								{suggestion.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if cityLookupStatus === 'loading'}
				<p class="text-sm text-muted-foreground">Ortsvorschläge werden geladen …</p>
			{:else if cityLookupStatus === 'error'}
				<p class="text-sm text-destructive">Ortsvorschläge konnten nicht geladen werden.</p>
			{/if}
		</div>
	{/if}

	{#if visible('businessOsmTags')}
		<section class="space-y-3">
			{@render heading('businessOsmTags', 'OSM-Kategorien für Betriebe')}
			<div class="flex flex-wrap gap-2">
				{#each config.businessOsmTags as tag (osmBusinessTagRaw(tag))}
					<Badge variant="secondary" class="h-auto gap-1 py-1 whitespace-normal">
						<span>{osmBusinessTagLabel(tag)}</span>
						<span class="font-mono text-[0.7rem] text-muted-foreground">
							{osmBusinessTagRaw(tag)}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							class="-mr-1 size-4 rounded-full"
							aria-label={`${osmBusinessTagRaw(tag)} entfernen`}
							onclick={() => removeTag(tag)}
						>
							<X class="size-3" />
						</Button>
					</Badge>
				{/each}
			</div>
			<div class="relative">
				<Input
					value={tagInput}
					oninput={(event) => onTagInput(event.currentTarget.value)}
					onkeydown={onTagKeydown}
					onblur={addTypedTag}
					aria-invalid={Boolean(tagInputError)}
					aria-expanded={tagSuggestions.length > 0}
					aria-label="OSM-Kategorie hinzufügen"
					placeholder="amenity=cafe"
				/>
				{#if tagSuggestions.length > 0}
					<div
						class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
					>
						{#each tagSuggestions as suggestion (suggestion.raw)}
							<button
								type="button"
								class="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
								onmousedown={(event) => {
									event.preventDefault();
									addTag({ key: suggestion.key, value: suggestion.value });
								}}
							>
								<span class="block">{suggestion.label}</span>
								<span class="block font-mono text-xs text-muted-foreground">{suggestion.raw}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if tagLookupStatus === 'loading'}
				<p class="text-sm text-muted-foreground">Kategorien werden geladen …</p>
			{:else if tagLookupStatus === 'error'}
				<p class="text-sm text-destructive">Kategorien konnten nicht geladen werden.</p>
			{/if}
			{#if tagInputError}
				<p class="text-sm font-medium text-destructive">{tagInputError}</p>
			{/if}
		</section>
	{/if}

	{#if visible('businessRadiusMeters')}
		<div class="max-w-xs space-y-2">
			{@render heading('businessRadiusMeters', 'Maximale Entfernung für Betriebe')}
			<Input
				type="number"
				min="250"
				max="20000"
				value={config.businessRadiusMeters}
				oninput={(event) => {
					const value = event.currentTarget.valueAsNumber;
					setField('businessRadiusMeters', Number.isFinite(value) ? value : 5000);
				}}
			/>
		</div>
	{/if}
</div>
