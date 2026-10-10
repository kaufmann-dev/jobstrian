<script lang="ts">
	import {
		createTable,
		FlexRender,
		renderSnippet,
		tableFeatures,
		type ColumnDef
	} from '@tanstack/svelte-table';
	import {
		APPLICATION_BUCKET_LABELS,
		type ApplicationBucket,
		type ApplicationStatus
	} from '#lib/applications.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import {
		daysAgoLabel,
		daysSince,
		formatDate,
		isOverdue,
		isStrongStatus,
		lastActivity,
		sinceDaysLabel,
		type ApplicationView
	} from './application-helpers.js';
	import StatusBadge from './status-badge.svelte';
	import StatusMenu from './status-menu.svelte';

	interface Props {
		variant: ApplicationBucket;
		applications: ApplicationView[];
		today: string;
		onselect: (application: ApplicationView) => void;
		onstatus: (application: ApplicationView, status: ApplicationStatus) => void;
		onmarkapplied: (application: ApplicationView) => void;
	}

	let { variant, applications, today, onselect, onstatus, onmarkapplied }: Props = $props();

	// The data is small and fully loaded, so only the core row model is needed.
	const features = tableFeatures({});
	type Column = ColumnDef<typeof features, ApplicationView>;
	type ColumnMeta = { class?: string; srOnly?: boolean };

	/** Tabs without a real reply are shown quiet and dense. */
	const dense = $derived(variant === 'waiting' || variant === 'ghosted' || variant === 'closed');

	const columns = $derived.by((): Column[] => {
		const company: Column = {
			id: 'company',
			header: 'Firma',
			cell: ({ row }) => renderSnippet(companyCell, { application: row.original }),
			meta: { class: 'max-w-0 w-full sm:w-auto sm:max-w-xs sm:min-w-48 whitespace-normal' }
		};
		const status: Column = {
			id: 'status',
			header: 'Status',
			cell: ({ row }) => renderSnippet(statusCell, { application: row.original }),
			meta: { class: 'hidden md:table-cell' }
		};
		const nextStep: Column = {
			id: 'nextStep',
			header: 'Nächster Schritt',
			cell: ({ row }) => renderSnippet(nextStepCell, { application: row.original }),
			meta: { class: 'hidden whitespace-normal md:table-cell md:max-w-56' }
		};
		const activity: Column = {
			id: 'activity',
			header: 'Letzte Aktivität',
			cell: ({ row }) => renderSnippet(activityCell, { application: row.original }),
			meta: { class: 'hidden whitespace-normal lg:table-cell lg:max-w-64' }
		};
		const applied: Column = {
			id: 'applied',
			header: 'Beworben',
			cell: ({ row }) => renderSnippet(appliedCell, { application: row.original }),
			meta: { class: 'hidden sm:table-cell' }
		};
		const closedOn: Column = {
			id: 'closedOn',
			header: 'Abgeschlossen',
			cell: ({ row }) => formatDate(row.original.lastEvent?.occurredAt ?? row.original.updatedAt),
			meta: { class: 'hidden tabular-nums md:table-cell' }
		};
		const location: Column = {
			id: 'location',
			header: 'Ort',
			cell: ({ row }) => row.original.location || '–',
			meta: { class: 'hidden md:table-cell' }
		};
		const actions: Column = {
			id: 'actions',
			header: 'Aktionen',
			cell: ({ row }) => renderSnippet(actionsCell, { application: row.original }),
			meta: { class: 'w-px text-right', srOnly: true }
		};
		switch (variant) {
			case 'responded':
				return [company, status, nextStep, activity, actions];
			case 'waiting':
			case 'ghosted':
				return [company, applied, actions];
			case 'closed':
				return [company, status, closedOn, actions];
			default:
				return [company, location, actions];
		}
	});

	const table = createTable({
		features,
		get data() {
			return applications;
		},
		get columns() {
			return columns;
		},
		getRowId: (application) => String(application.id)
	});

	function meta(column: Column): ColumnMeta {
		return (column.meta ?? {}) as ColumnMeta;
	}

	function rowClick(event: MouseEvent, application: ApplicationView) {
		// Buttons, links and menu items inside the row handle their own clicks.
		if ((event.target as Element).closest('button, a, [role="menuitem"]')) return;
		onselect(application);
	}
</script>

{#snippet companyCell({ application }: { application: ApplicationView })}
	<div class="min-w-0">
		<button
			type="button"
			class={[
				'block max-w-full truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring',
				dense ? 'text-foreground/80' : 'font-semibold'
			]}
			onclick={() => onselect(application)}
		>
			{application.companyName}
		</button>
		{#if application.positionTitle}
			<div class={['truncate text-muted-foreground', dense && 'text-xs']}>
				{application.positionTitle}
			</div>
		{/if}
		{#if variant === 'responded' || variant === 'closed'}
			<StatusBadge status={application.status} muted={dense} class="mt-1 md:hidden" />
		{:else if dense}
			<div class="text-xs sm:hidden">
				{variant === 'ghosted'
					? sinceDaysLabel(application.daysSinceApplied)
					: daysAgoLabel(application.daysSinceApplied)}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet statusCell({ application }: { application: ApplicationView })}
	<StatusBadge status={application.status} muted={dense} />
{/snippet}

{#snippet nextStepCell({ application }: { application: ApplicationView })}
	{@const overdue = isOverdue(application, today)}
	{#if application.nextStepOn || application.nextStepNote}
		<div class={overdue ? 'text-destructive' : undefined}>
			{#if application.nextStepOn}
				<div class="font-medium tabular-nums">
					{formatDate(application.nextStepOn)}
					{#if overdue}<span class="text-xs font-normal">· überfällig</span>{/if}
				</div>
			{/if}
			{#if application.nextStepNote}
				<div
					class={[
						'line-clamp-2 text-xs',
						overdue ? 'text-destructive/80' : 'text-muted-foreground'
					]}
				>
					{application.nextStepNote}
				</div>
			{/if}
		</div>
	{:else}
		<span class="text-muted-foreground">–</span>
	{/if}
{/snippet}

{#snippet activityCell({ application }: { application: ApplicationView })}
	{@const activity = lastActivity(application)}
	{#if activity}
		<div class="line-clamp-2">{activity.text}</div>
		<div class="text-xs text-muted-foreground">
			{daysAgoLabel(daysSince(activity.occurredAt, today))}
		</div>
	{:else}
		<span class="text-muted-foreground">–</span>
	{/if}
{/snippet}

{#snippet appliedCell({ application }: { application: ApplicationView })}
	<span class="tabular-nums">
		{variant === 'ghosted'
			? sinceDaysLabel(application.daysSinceApplied)
			: daysAgoLabel(application.daysSinceApplied)}
	</span>
	<span class="text-xs"> · {formatDate(application.appliedOn)}</span>
{/snippet}

{#snippet actionsCell({ application }: { application: ApplicationView })}
	<div class="flex items-center justify-end gap-1">
		{#if variant === 'responded'}
			<StatusMenu
				current={application.status}
				company={application.companyName}
				onpick={(status) => onstatus(application, status)}
			/>
		{:else}
			{#if variant === 'ghosted'}
				<Button variant="outline" size="sm" onclick={() => onstatus(application, 'replied')}>
					Doch Antwort erhalten
				</Button>
			{:else if variant === 'planned'}
				<Button variant="outline" size="sm" onclick={() => onmarkapplied(application)}>
					Als beworben markieren
				</Button>
			{/if}
			<StatusMenu
				current={application.status}
				company={application.companyName}
				variant="ghost"
				compact
				onpick={(status) => onstatus(application, status)}
			/>
		{/if}
	</div>
{/snippet}

<div
	class={[
		'overflow-hidden rounded-2xl border',
		dense ? 'border-dashed bg-muted/20 text-muted-foreground' : 'bg-card'
	]}
>
	<Table.Root
		aria-label={APPLICATION_BUCKET_LABELS[variant]}
		class={dense ? 'text-[13px]' : undefined}
	>
		<Table.Header class={dense ? 'bg-transparent' : 'bg-muted/60'}>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row class="hover:bg-transparent">
					{#each headerGroup.headers as header (header.id)}
						{@const columnMeta = meta(header.column.columnDef)}
						<Table.Head
							colspan={header.colSpan}
							class={[
								'text-xs font-medium tracking-wide uppercase',
								dense ? 'h-8 text-muted-foreground/80' : 'text-muted-foreground',
								columnMeta.class
							]}
						>
							<span class={columnMeta.srOnly ? 'sr-only' : undefined}>
								<FlexRender {header} />
							</span>
						</Table.Head>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				<Table.Row
					class={[
						'cursor-pointer',
						dense ? 'h-9 hover:bg-muted/40' : 'h-14',
						!dense && isStrongStatus(row.original.status) && 'bg-primary/5 hover:bg-primary/10'
					]}
					onclick={(event) => rowClick(event, row.original)}
				>
					{#each row.getAllCells() as cell (cell.id)}
						<Table.Cell class={[dense && 'py-1', meta(cell.column.columnDef).class]}>
							<FlexRender {cell} />
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
