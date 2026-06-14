<script lang="ts">
	import {
		normalizeOsmBusinessTags,
		osmBusinessTagSuggestions,
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
	import type { GeoSuggestion } from '$lib/geo';
	import RemoteAutocomplete from './remote-autocomplete.svelte';
	import StringListEditor from './string-list-editor.svelte';
	import X from '@lucide/svelte/icons/x';

	let {
		config = $bindable(),
		fields,
		selected = $bindable([]),
		errors = {}
	}: {
		config: SearchConfig;
		fields?: SearchConfigField[];
		selected?: SearchConfigField[];
		errors?: Partial<Record<SearchConfigField, string[] | undefined>>;
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
	let tagInput = $state('');
	let tagInputError = $state('');
	const tagSuggestions = $derived<OsmBusinessTagSuggestion[]>(
		tagInput.trim().length >= 2 ? osmBusinessTagSuggestions(tagInput) : []
	);

	function visible(field: SearchConfigField): boolean {
		return visibleFields.includes(field);
	}

	function selection(field: SearchConfigField, checked: boolean) {
		selected = checked
			? [...new Set([...selected, field])]
			: selected.filter((item) => item !== field);
	}

	function setField<Field extends keyof SearchConfig>(field: Field, value: SearchConfig[Field]) {
		config = { ...config, [field]: value };
	}

	function addCity(city: string) {
		const normalized = city.trim();
		if (!normalized) return;
		setField('jobSearchLocations', [...new Set([...config.jobSearchLocations, normalized])]);
		cityInput = '';
	}

	function removeCity(city: string) {
		setField(
			'jobSearchLocations',
			config.jobSearchLocations.filter((item) => item !== city)
		);
	}

	function onCityInput(value: string) {
		cityInput = value;
	}

	function selectCity(suggestion: GeoSuggestion) {
		addCity(suggestion.city || suggestion.label);
	}

	function addTag(tag: OsmBusinessTag) {
		setField('businessOsmTags', normalizeOsmBusinessTags([...config.businessOsmTags, tag]));
		tagInput = '';
		tagInputError = '';
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

	function onTagBlur() {
		addTypedTag();
	}

	function removeTag(tag: OsmBusinessTag) {
		setField(
			'businessOsmTags',
			config.businessOsmTags.filter((item) => !(item.key === tag.key && item.value === tag.value))
		);
	}

	function onTagInput(value: string) {
		tagInput = value;
		tagInputError = '';
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
			<StringListEditor
				values={config.jobSearchKeywords}
				label="Stellen-Keywords"
				placeholder="Pflegeassistenz, Verkauf, Office"
				onValuesChange={(values) => setField('jobSearchKeywords', values)}
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
			<RemoteAutocomplete
				kind="city"
				bind:value={cityInput}
				onInput={onCityInput}
				onSelect={selectCity}
				onBlur={() => addCity(cityInput)}
				label="Job-Suchort hinzufügen"
				placeholder="Graz, Linz, Salzburg"
			/>
			{#each errors.jobSearchLocations ?? [] as error (error)}
				<p class="text-sm font-medium text-destructive">{error}</p>
			{/each}
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
					onblur={onTagBlur}
					aria-invalid={Boolean(tagInputError)}
					aria-expanded={tagSuggestions.length > 0}
					aria-label="OSM-Kategorie hinzufügen"
					placeholder="amenity=cafe"
				/>
				{#if tagSuggestions.length > 0}
					<div
						onmousedown={(event) => event.preventDefault()}
						role="listbox"
						tabindex="-1"
						class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
					>
						{#each tagSuggestions as suggestion (suggestion.raw)}
							<button
								type="button"
								role="option"
								aria-selected="false"
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
			{#each [tagInputError, ...(errors.businessOsmTags ?? [])].filter(Boolean) as error (error)}
				<p class="text-sm font-medium text-destructive">{error}</p>
			{/each}
		</section>
	{/if}

	{#if visible('businessRadiusMeters')}
		<div class="space-y-2">
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
			{#each errors.businessRadiusMeters ?? [] as error (error)}
				<p class="text-sm font-medium text-destructive">{error}</p>
			{/each}
		</div>
	{/if}
</div>
