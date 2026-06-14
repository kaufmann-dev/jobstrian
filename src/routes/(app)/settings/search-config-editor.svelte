<script lang="ts">
	import {
		OSM_TAG_CATALOG,
		normalizeOsmBusinessTags,
		type OsmBusinessTag,
		type OsmBusinessTagKey,
		type SearchConfigField,
		type SearchConfigPreview
	} from '$lib/search-config';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	let {
		config = $bindable(),
		fields,
		selected = $bindable([])
	}: {
		config: SearchConfigPreview;
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
	const tagSelection = $derived(
		new Set(config.businessOsmTags.map((tag) => `${tag.key}=${tag.value}`))
	);

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

	function setField<Field extends keyof SearchConfigPreview>(
		field: Field,
		value: SearchConfigPreview[Field]
	) {
		config = { ...config, [field]: value };
	}

	function toggleTag(key: OsmBusinessTagKey, value: string, checked: boolean) {
		const next = checked
			? [...config.businessOsmTags, { key, value }]
			: config.businessOsmTags.filter((tag) => !(tag.key === key && tag.value === value));
		setField('businessOsmTags', normalizeOsmBusinessTags(next as OsmBusinessTag[]));
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
			<Input
				value={config.jobSearchLocations.join(', ')}
				onchange={(event) =>
					setField(
						'jobSearchLocations',
						parseList((event.currentTarget as HTMLInputElement).value)
					)}
				placeholder="Wien, Graz, Linz"
			/>
		</div>
	{/if}

	{#if visible('businessOsmTags')}
		<section class="space-y-3">
			{@render heading('businessOsmTags', 'OSM-Kategorien für Betriebe')}
			<div class="space-y-4 rounded-lg border p-3">
				{#each Object.entries(OSM_TAG_CATALOG) as [key, values] (key)}
					<div class="space-y-2">
						<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{key}</p>
						<div class="flex flex-wrap gap-2">
							{#each values as value (`${key}:${value}`)}
								<label class="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
									<Checkbox
										checked={tagSelection.has(`${key}=${value}`)}
										onCheckedChange={(checked) =>
											toggleTag(key as OsmBusinessTagKey, value, checked === true)}
									/>
									{value}
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
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
