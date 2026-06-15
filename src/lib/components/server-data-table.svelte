<script lang="ts" generics="TData">
	import { getCoreRowModel, type ColumnDef } from '@tanstack/table-core';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { createSvelteTable } from '$lib/components/ui/data-table/data-table.svelte.js';
	import FlexRender from '$lib/components/ui/data-table/flex-render.svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Search from '@lucide/svelte/icons/search';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { ServerListController } from './server-list-controller.svelte.js';

	type ServerSort = { asc: string; desc: string; initial: 'asc' | 'desc' };
	type ColumnMeta = { class?: string; headerClass?: string; sort?: ServerSort };

	interface Props {
		controller: ServerListController<TData>;
		columns: ColumnDef<TData>[];
		emptyText: string;
		itemLabel: string;
		searchPlaceholder: string;
		defaultSort: string;
		filters?: Snippet;
		onResetFilters?: () => void;
		onRowClick?: (row: TData) => void;
	}

	let {
		controller,
		columns,
		emptyText,
		itemLabel,
		searchPlaceholder,
		defaultSort,
		filters,
		onResetFilters,
		onRowClick
	}: Props = $props();

	let search = $state('');
	let sort = $derived(defaultSort);
	let debounce: ReturnType<typeof setTimeout> | undefined;

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

	function toggleSort(config: ServerSort): void {
		updateSort(
			sort === config.asc ? config.desc : sort === config.desc ? config.asc : config[config.initial]
		);
	}

	function sortDirection(config: ServerSort | undefined): 'ascending' | 'descending' | undefined {
		if (!config) return undefined;
		if (sort === config.asc) return 'ascending';
		if (sort === config.desc) return 'descending';
		return undefined;
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
	<div
		class="grid gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4 lg:grid-cols-[minmax(20rem,1fr)_auto] lg:items-end"
	>
		<div class="relative min-w-0">
			<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={search}
				oninput={(event) => updateSearch(event.currentTarget.value)}
				placeholder={searchPlaceholder}
				aria-label={searchPlaceholder}
				class="bg-background pl-9"
			/>
		</div>
		<div class="grid grid-cols-2 items-end gap-2 sm:grid-cols-4 lg:flex lg:flex-nowrap lg:gap-3">
			{#if filters}{@render filters()}{/if}
			<Button
				variant="ghost"
				size="sm"
				class="h-10 justify-center bg-input/35 lg:h-8"
				onclick={resetAll}
			>
				<RotateCcw class="size-4" />
				Zurücksetzen
			</Button>
		</div>
	</div>

	<p class="text-sm text-muted-foreground" aria-live="polite">
		{controller.items.length} von {controller.matchingTotal.toLocaleString('de-AT')} passenden
		{itemLabel} geladen · {controller.total.toLocaleString('de-AT')} insgesamt
	</p>

	<div
		class={[
			'overflow-hidden rounded-xl border bg-card shadow-sm transition-opacity [&_[data-slot=table-container]]:overflow-x-hidden',
			controller.loading && controller.items.length > 0 && 'pointer-events-none opacity-50'
		]}
		aria-busy={controller.loading}
	>
		<Table.Root class="table-fixed">
			<Table.Header class="sticky top-0 z-10 bg-muted/60 backdrop-blur">
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row class="hover:bg-transparent">
						{#each headerGroup.headers as header (header.id)}
							{@const columnMeta = meta(header.column.columnDef)}
							{@const direction = sortDirection(columnMeta.sort)}
							<Table.Head
								colspan={header.colSpan}
								aria-sort={direction}
								class={[
									'text-xs font-medium tracking-wide text-muted-foreground uppercase',
									columnMeta.headerClass ?? columnMeta.class
								]}
							>
								{#if columnMeta.sort}
									<button
										type="button"
										class="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
										onclick={() => toggleSort(columnMeta.sort!)}
									>
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
										{#if direction === 'ascending'}
											<ArrowUp class="size-3.5" />
										{:else if direction === 'descending'}
											<ArrowDown class="size-3.5" />
										{:else}
											<ChevronsUpDown class="size-3.5 opacity-50" />
										{/if}
									</button>
								{:else}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each table.getRowModel().rows as row (row.id)}
					<Table.Row
						class={['h-11', onRowClick && 'cursor-pointer']}
						onclick={onRowClick ? () => onRowClick(row.original) : undefined}
					>
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
							{controller.total > 0
								? 'Keine Treffer für die aktuelle Suche oder Filter.'
								: emptyText}
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
				Mehr laden ({(controller.matchingTotal - controller.items.length).toLocaleString('de-AT')} weitere)
			</Button>
		{:else if controller.loading}
			<Spinner class="size-5" aria-label="Ergebnisse werden geladen" />
		{/if}
	</div>
</div>
