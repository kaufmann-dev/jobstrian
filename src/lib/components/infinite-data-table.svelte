<script lang="ts" generics="TData">
	import { getCoreRowModel, type ColumnDef } from '@tanstack/table-core';
	import type { Attachment } from 'svelte/attachments';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { createSvelteTable } from '$lib/components/ui/data-table/data-table.svelte.js';
	import FlexRender from '$lib/components/ui/data-table/flex-render.svelte';
	import type { InfiniteListController } from './infinite-list-controller.svelte.js';

	interface Props {
		controller: InfiniteListController<TData>;
		columns: ColumnDef<TData>[];
		emptyText: string;
		itemLabel: string;
	}

	let { controller, columns, emptyText, itemLabel }: Props = $props();

	const table = createSvelteTable({
		get data() {
			return controller.items;
		},
		get columns() {
			return columns;
		},
		getCoreRowModel: getCoreRowModel()
	});

	const observeSentinel: Attachment = (element) => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void controller.loadMore();
			},
			{ rootMargin: '240px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	};
</script>

<div class="space-y-3">
	<p class="text-sm text-muted-foreground" aria-live="polite">
		{controller.items.length} von {controller.matchingTotal.toLocaleString('de-AT')} passenden
		{itemLabel} geladen · {controller.total.toLocaleString('de-AT')} insgesamt
	</p>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head colspan={header.colSpan}>
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
					<Table.Row>
						{#each row.getVisibleCells() as cell (cell.id)}
							<Table.Cell>
								<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
							</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="py-8 text-center text-muted-foreground">
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

	<div class="flex min-h-10 justify-center" {@attach observeSentinel}>
		{#if controller.hasMore}
			<Button variant="outline" onclick={() => controller.loadMore()} disabled={controller.loading}>
				{#if controller.loading}<Spinner class="size-4" />{/if}
				Mehr laden
			</Button>
		{:else if controller.loading}
			<Spinner class="size-5" aria-label="Weitere Ergebnisse werden geladen" />
		{/if}
	</div>
</div>
