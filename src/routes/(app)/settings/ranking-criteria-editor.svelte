<script lang="ts">
	import {
		type GeneratedRankingCriteriaField,
		type RankingCriteria,
		type RankingCriterion
	} from '$lib/ranking-criteria';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type CriteriaConfig = {
		listingRankingCriteria: RankingCriteria;
		leadRankingCriteria: RankingCriteria;
	};

	type Field = GeneratedRankingCriteriaField;

	let {
		criteria = $bindable(),
		fields,
		selected = $bindable([]),
		errors = {}
	}: {
		criteria: CriteriaConfig;
		fields?: Field[];
		selected?: Field[];
		errors?: Partial<Record<Field, string[] | undefined>>;
	} = $props();

	const allFields: Field[] = ['listingRankingCriteria', 'leadRankingCriteria'];
	const visibleFields = $derived(fields ?? allFields);
	const selectable = $derived(Boolean(fields));

	function visible(field: Field): boolean {
		return visibleFields.includes(field);
	}

	function selection(field: Field, checked: boolean) {
		selected = checked
			? [...new Set([...selected, field])]
			: selected.filter((item) => item !== field);
	}

	function setCriteria(field: Field, value: RankingCriteria) {
		criteria = { ...criteria, [field]: value };
	}

	function setCriterion(field: Field, index: number, patch: Partial<RankingCriterion>) {
		setCriteria(
			field,
			criteria[field].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
		);
	}

	function nextId(field: Field): string {
		const used = new Set(criteria[field].map((criterion) => criterion.id));
		let counter = criteria[field].length + 1;
		let id = `criterion-${counter}`;
		while (used.has(id)) {
			counter += 1;
			id = `criterion-${counter}`;
		}
		return id;
	}

	function addCriterion(field: Field) {
		setCriteria(field, [
			...criteria[field],
			{ id: nextId(field), label: '', description: '', weight: 3 }
		]);
	}

	function removeCriterion(field: Field, index: number) {
		setCriteria(
			field,
			criteria[field].filter((_item, itemIndex) => itemIndex !== index)
		);
	}
</script>

{#snippet heading(field: Field, label: string)}
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

{#snippet editor(field: Field, label: string)}
	<section class="space-y-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			{@render heading(field, label)}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="w-full sm:w-auto"
				disabled={criteria[field].length >= 8}
				onclick={() => addCriterion(field)}
			>
				<Plus />
				Kriterium hinzufügen
			</Button>
		</div>

		<div class="space-y-3">
			{#each criteria[field] as criterion, index (criterion.id)}
				<div class="rounded-lg border p-3">
					<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5rem_auto]">
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${criterion.id}-id`}
							>
								ID
							</label>
							<Input
								id={`${field}-${criterion.id}-id`}
								value={criterion.id}
								maxlength={80}
								oninput={(event) => setCriterion(field, index, { id: event.currentTarget.value })}
							/>
						</div>
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${criterion.id}-label`}
							>
								Label
							</label>
							<Input
								id={`${field}-${criterion.id}-label`}
								value={criterion.label}
								maxlength={80}
								oninput={(event) =>
									setCriterion(field, index, { label: event.currentTarget.value })}
							/>
						</div>
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${criterion.id}-weight`}
							>
								Gewicht
							</label>
							<Input
								id={`${field}-${criterion.id}-weight`}
								type="number"
								min="1"
								max="5"
								value={criterion.weight}
								oninput={(event) => {
									const value = event.currentTarget.valueAsNumber;
									setCriterion(field, index, {
										weight: Number.isFinite(value) ? value : criterion.weight
									});
								}}
							/>
						</div>
						<div class="flex items-end">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								disabled={criteria[field].length <= 2}
								aria-label={`${criterion.label || criterion.id} entfernen`}
								onclick={() => removeCriterion(field, index)}
							>
								<Trash2 />
							</Button>
						</div>
					</div>
					<div class="mt-3 space-y-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for={`${field}-${criterion.id}-description`}
						>
							Beschreibung
						</label>
						<Textarea
							id={`${field}-${criterion.id}-description`}
							value={criterion.description}
							rows={2}
							maxlength={500}
							oninput={(event) =>
								setCriterion(field, index, { description: event.currentTarget.value })}
						/>
					</div>
				</div>
			{/each}
		</div>

		{#each errors[field] ?? [] as error (error)}
			<p class="text-sm font-medium text-destructive">{error}</p>
		{/each}
	</section>
{/snippet}

<div class="space-y-6">
	{#if visible('listingRankingCriteria')}
		{@render editor('listingRankingCriteria', 'Bewertungskriterien für Stellen')}
	{/if}
	{#if visible('leadRankingCriteria')}
		{@render editor('leadRankingCriteria', 'Bewertungskriterien für Betriebe')}
	{/if}
</div>
