<script lang="ts" generics="TData">
	import { getCoreRowModel, type ColumnDef } from '@tanstack/table-core';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { createSvelteTable } from '$lib/components/ui/data-table/data-table.svelte.js';
	import FlexRender from '$lib/components/ui/data-table/flex-render.svelte';
	import Search from '@lucide/svelte/icons/search';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { ServerListController } from './server-list-controller.svelte.js';

	type SortOption = { value: string; label: string };
	type ColumnMeta = { class?: string; headerClass?: string };

	interface Props {
		controller: ServerListController<TData>;
		columns: ColumnDef<TData>[];
		emptyText: string;
		itemLabel: string;
		searchPlaceholder: string;
		sortOptions: SortOption[];
		defaultSort: string;
		filters?: Snippet;
		onResetFilters?: () => void;
	}

	let {
		controller,
		columns,
		emptyText,
		itemLabel,
		searchPlaceholder,
		sortOptions,
		defaultSort,
		filters,
		onResetFilters
	}: Props = $props();

	let search = $state('');
	let sort = $derived(defaultSort);
	let debounce: ReturnType<typeof setTimeout> | undefined;
	const sortLabel = $derived(
		sortOptions.find((option) => option.value === sort)?.label ?? 'Sortierung'
	);

	const table = createSvelteTable({
		get data() {
			return controller.items;
		},
		get columns() {
			return columns;
		},
		getCoreRowModel: getCoreRowModel()
	});

	function meta(column: ColumnDef<TData>): ColumnMeta {
		return (column.meta ?? {}) as ColumnMeta;
	}

	function updateSearch(value: string): void {
		search = value;
		clearTimeout(debounce);
		debounce = setTimeout(() => void controller.reset({ search }), 300);
	}

	function updateSort(value: string): void {
		sort = value;
		void controller.reset({ sort });
	}

	function resetAll(): void {
		clearTimeout(debounce);
		search = '';
		sort = defaultSort;
		onResetFilters?.();
		void controller.replaceParams({ sort: defaultSort });
	}
</script>

<div class="space-y-3">
	<div class="flex flex-col gap-3 rounded-md border bg-card p-3 lg:flex-row lg:items-end">
		<div class="relative min-w-0 flex-1">
			<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={search}
				oninput={(event) => updateSearch(event.currentTarget.value)}
				placeholder={searchPlaceholder}
				aria-label={searchPlaceholder}
				class="pl-9"
			/>
		</div>
		<div class="flex flex-wrap items-end gap-3">
			{#if filters}{@render filters()}{/if}
			<div class="space-y-1">
				<span class="text-xs font-medium text-muted-foreground">Sortierung</span>
				<Select.Root
					type="single"
					value={sort}
					onValueChange={(value) => value && updateSort(value)}
				>
					<Select.Trigger class="w-40">{sortLabel}</Select.Trigger>
					<Select.Content>
						{#each sortOptions as option (option.value)}
							<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<Button variant="ghost" size="sm" onclick={resetAll}>
				<RotateCcw class="size-4" />
				Zurücksetzen
			</Button>
		</div>
	</div>

	<p class="text-sm text-muted-foreground" aria-live="polite">
		{controller.items.length} von {controller.matchingTotal.toLocaleString('de-AT')} passenden
		{itemLabel} geladen · {controller.total.toLocaleString('de-AT')} insgesamt
	</p>

	<div class="overflow-hidden rounded-md border [&_[data-slot=table-container]]:overflow-x-hidden">
		<Table.Root class="table-fixed">
			<Table.Header class="sticky top-0 z-10 bg-background">
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head
								colspan={header.colSpan}
								class={meta(header.column.columnDef).headerClass ??
									meta(header.column.columnDef).class}
							>
								<FlexRender
									content={header.column.columnDef.header}
									context={header.getContext()}
								/>
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each table.getRowModel().rows as row (row.id)}
					<Table.Row class="h-11">
						{#each row.getVisibleCells() as cell (cell.id)}
							<Table.Cell class={meta(cell.column.columnDef).class}>
								<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
							</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell
							colspan={columns.length}
							class="py-8 text-center whitespace-normal text-muted-foreground"
						>
							{emptyText}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if controller.error}
		<p class="text-sm text-destructive" role="alert">{controller.error}</p>
	{/if}

	<div class="flex min-h-10 justify-center">
		{#if controller.hasMore}
			<Button variant="outline" onclick={() => controller.loadMore()} disabled={controller.loading}>
				{#if controller.loading}<Spinner class="size-4" />{/if}
				Mehr laden
			</Button>
		{:else if controller.loading}
			<Spinner class="size-5" aria-label="Ergebnisse werden geladen" />
		{/if}
	</div>
</div>
