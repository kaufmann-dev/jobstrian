<script lang="ts">
	import {
		type GeneratedRankingCriteriaField,
		type RankingCriteria,
		type RankingCriterion
	} from '$lib/ranking-criteria';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';

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

	// Stable per-row keys, independent of the editable `id`. Keying the `{#each}`
	// on `criterion.id` destroyed and recreated the row on every keystroke in the
	// ID field, which dropped input focus.
	let keyCounter = 0;
	const makeKey = () => `row-${keyCounter++}`;
	let rowKeys = $state<Record<Field, string[]>>({
		listingRankingCriteria: criteria.listingRankingCriteria.map(makeKey),
		leadRankingCriteria: criteria.leadRankingCriteria.map(makeKey)
	});

	// Keep keys aligned when `criteria` is replaced from outside (e.g. applying an
	// AI preview); local add/remove keep their own keys in sync directly.
	$effect(() => {
		for (const field of allFields) {
			const need = criteria[field].length;
			untrack(() => {
				const have = rowKeys[field];
				if (have.length === need) return;
				rowKeys[field] =
					need > have.length
						? [...have, ...Array.from({ length: need - have.length }, makeKey)]
						: have.slice(0, need);
			});
		}
	});

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
		rowKeys[field] = [...rowKeys[field], makeKey()];
	}

	function removeCriterion(field: Field, index: number) {
		setCriteria(
			field,
			criteria[field].filter((_item, itemIndex) => itemIndex !== index)
		);
		rowKeys[field] = rowKeys[field].filter((_key, keyIndex) => keyIndex !== index);
	}
</script>

{#snippet editor(field: Field, label: string)}
	<section class="space-y-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			{#if selectable}
				<label class="flex items-center gap-2 text-sm font-medium">
					<Checkbox
						checked={selected.includes(field)}
						onCheckedChange={(checked) => selection(field, checked === true)}
						aria-label={`${label} übernehmen`}
					/>
					Übernehmen
				</label>
			{/if}
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
			{#each criteria[field] as criterion, index (rowKeys[field][index])}
				{@const rowKey = rowKeys[field][index]}
				<div class="rounded-lg border p-3">
					<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5rem_auto]">
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${rowKey}-id`}
							>
								ID
							</label>
							<Input
								id={`${field}-${rowKey}-id`}
								value={criterion.id}
								maxlength={80}
								oninput={(event) => setCriterion(field, index, { id: event.currentTarget.value })}
							/>
						</div>
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${rowKey}-label`}
							>
								Label
							</label>
							<Input
								id={`${field}-${rowKey}-label`}
								value={criterion.label}
								maxlength={80}
								oninput={(event) =>
									setCriterion(field, index, { label: event.currentTarget.value })}
							/>
						</div>
						<div class="space-y-1">
							<label
								class="text-xs font-medium text-muted-foreground"
								for={`${field}-${rowKey}-weight`}
							>
								Gewicht
							</label>
							<Input
								id={`${field}-${rowKey}-weight`}
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
							for={`${field}-${rowKey}-description`}
						>
							Beschreibung
						</label>
						<Textarea
							id={`${field}-${rowKey}-description`}
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

<Accordion.Root type="multiple">
	{#if visible('listingRankingCriteria')}
		<Accordion.Item value="listing-ranking-criteria" class="data-open:bg-transparent">
			<Accordion.Trigger
				class="items-center gap-4 hover:no-underline [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1"
			>
				<span class="truncate">Kriterien für Stellen</span>
				<span
					class="w-8 shrink-0 text-center text-xs font-normal text-muted-foreground tabular-nums"
				>
					{criteria.listingRankingCriteria.length}
				</span>
			</Accordion.Trigger>
			<Accordion.Content>
				{@render editor('listingRankingCriteria', 'Bewertungskriterien für Stellen')}
			</Accordion.Content>
		</Accordion.Item>
	{/if}
	{#if visible('leadRankingCriteria')}
		<Accordion.Item value="lead-ranking-criteria" class="data-open:bg-transparent">
			<Accordion.Trigger
				class="items-center gap-4 hover:no-underline [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1"
			>
				<span class="truncate">Kriterien für Betriebe</span>
				<span
					class="w-8 shrink-0 text-center text-xs font-normal text-muted-foreground tabular-nums"
				>
					{criteria.leadRankingCriteria.length}
				</span>
			</Accordion.Trigger>
			<Accordion.Content>
				{@render editor('leadRankingCriteria', 'Bewertungskriterien für Betriebe')}
			</Accordion.Content>
		</Accordion.Item>
	{/if}
</Accordion.Root>
