<script lang="ts">
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { type SearchStatus } from '#lib/applications.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Pause from '@lucide/svelte/icons/pause';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Play from '@lucide/svelte/icons/play';
	import Plus from '@lucide/svelte/icons/plus';
	import Square from '@lucide/svelte/icons/square';
	import Trophy from '@lucide/svelte/icons/trophy';
	import type { PageData } from './$types';
	import {
		episodeLabel,
		episodeRange,
		formatResponseRate,
		type SearchView
	} from './application-helpers.js';
	import { actionFormOptions, detachedForm } from './form-helpers.js';
	import { searchStatusFormSchema } from './schema';

	interface Props {
		/** Slug of the person whose applications are shown. */
		person: string;
		searches: SearchView[];
		selected: SearchView | null;
		hasActiveSearch: boolean;
		/** Applications of the selected search in status "Gespräch". */
		interviews: number;
		statusForm: PageData['searchStatusForm'];
		today: string;
		onnew: () => void;
		onedit: () => void;
	}

	let {
		person,
		searches,
		selected,
		hasActiveSearch,
		interviews,
		statusForm: source,
		today,
		onnew,
		onedit
	}: Props = $props();

	const status = superForm(
		untrack(() => detachedForm(source, 'search-status-inline', {})),
		{
			...actionFormOptions(),
			resetForm: false,
			validators: zod4Client(searchStatusFormSchema)
		}
	);
	const { enhance, submitting } = status;
	const enhanceAttachment = fromAction(enhance);

	const stats = $derived<{ value: string; label: string; hint?: string }[]>(
		selected
			? [
					{ value: String(selected.bucketCounts.responded), label: 'Rückmeldungen' },
					{ value: String(interviews), label: 'Gespräche' },
					{ value: String(selected.bucketCounts.ghosted), label: 'ohne Antwort' },
					{
						value: formatResponseRate(selected),
						label: 'Antwortquote',
						hint: `${selected.reacted} von ${selected.sent} abgeschickten Bewerbungen haben eine Rückmeldung bekommen, Absagen eingerechnet.`
					}
				]
			: []
	);

	function selectSearch(value: string) {
		if (!value || value === String(selected?.id)) return;
		void goto(resolve(`/(app)/p/[person]/applications?search=${value}`, { person }), {
			reset: false
		});
	}

	/** Closing a search ends it today; resuming clears the end date. */
	function setSearchStatus(next: SearchStatus) {
		if (!selected) return;
		status.form.set({
			id: selected.id,
			status: next,
			endedOn: next === 'searching' ? '' : today
		});
		status.submit();
	}
</script>

<section class="space-y-3 rounded-2xl border bg-card p-3 sm:p-4" aria-label="Jobsuche">
	<div class="flex flex-wrap items-center gap-2">
		<Select.Root
			type="single"
			value={selected ? String(selected.id) : ''}
			onValueChange={selectSearch}
		>
			<Select.Trigger class="h-9 w-full sm:w-96" aria-label="Jobsuche auswählen">
				{selected ? episodeLabel(selected) : 'Keine Suche'}
			</Select.Trigger>
			<Select.Content>
				{#each searches as search (search.id)}
					<Select.Item value={String(search.id)} label={episodeLabel(search)}>
						<span class="flex min-w-0 flex-col items-start">
							<span>{episodeLabel(search)}</span>
							<span class="text-xs text-muted-foreground">{episodeRange(search)}</span>
						</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		{#if selected}
			<Button
				variant="ghost"
				size="icon"
				aria-label="Suche bearbeiten"
				title="Suche bearbeiten"
				onclick={onedit}
			>
				<Pencil />
			</Button>
		{/if}

		<div class="flex flex-wrap items-center gap-2 sm:ml-auto">
			{#if selected?.status === 'searching'}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class={buttonVariants({ variant: 'outline' })}
						disabled={$submitting}
					>
						{#if $submitting}<Spinner />{/if}
						Suche abschließen
						<ChevronDown />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-56">
						<DropdownMenu.Item onSelect={() => setSearchStatus('found')}>
							<Trophy />
							Stelle gefunden
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={() => setSearchStatus('paused')}>
							<Pause />
							Pausieren
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={() => setSearchStatus('stopped')}>
							<Square />
							Beenden
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else if selected}
				<Button
					variant="outline"
					disabled={$submitting}
					onclick={() => setSearchStatus('searching')}
				>
					{#if $submitting}<Spinner />{:else}<Play />{/if}
					Wieder aufnehmen
				</Button>
			{/if}

			{#if hasActiveSearch}
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<span {...props} class="inline-flex" role="presentation">
									<Button variant="outline" disabled>
										<Plus />
										Neue Suche
									</Button>
								</span>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							Es läuft bereits eine Suche. Schließe oder pausiere sie zuerst.
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{:else}
				<Button variant="outline" onclick={onnew}>
					<Plus />
					Neue Suche
				</Button>
			{/if}
		</div>
	</div>

	{#if selected}
		<p class="text-xs text-muted-foreground">
			{episodeRange(selected)}{selected.goal ? ` · Ziel: ${selected.goal}` : ''}
		</p>
		<ul class="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted-foreground">
			{#each stats as stat (stat.label)}
				<li title={stat.hint}>
					<span class="font-semibold text-foreground tabular-nums">{stat.value}</span>
					{stat.label}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<form method="POST" action="?/setSearchStatus" {@attach enhanceAttachment} hidden></form>
