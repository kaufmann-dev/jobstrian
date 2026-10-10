<script lang="ts">
	import { personColor, personInitials } from '#lib/people.js';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Users from '@lucide/svelte/icons/users';
	import IdActionForm from './id-action-form.svelte';
	import PersonDialog from './person-dialog.svelte';
	import type { PageData } from './$types';

	type Person = PageData['people'][number];

	let { people, personForm }: { people: Person[]; personForm: PageData['personForm'] } = $props();

	let personDialog = $state<ReturnType<typeof PersonDialog>>();
	let confirmOpen = $state(false);
	let target = $state.raw<Person | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	let deleting = $state(false);

	function count(n: number, one: string, many: string): string {
		return `${n} ${n === 1 ? one : many}`;
	}

	function counts(person: Person): string {
		return [
			count(person.listings, 'Stelle', 'Stellen'),
			count(person.leads, 'Betrieb', 'Betriebe'),
			count(person.applications, 'Bewerbung', 'Bewerbungen')
		].join(' · ');
	}

	function askDelete(person: Person) {
		target = person;
		confirmOpen = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="space-y-1.5">
				<Card.Title>Personen</Card.Title>
				<Card.Description>
					Jede Person hat eigene Stellen, Betriebe, Bewerbungen und einen eigenen Lebenslauf.
				</Card.Description>
			</div>
			<Button size="sm" class="w-full sm:w-auto" onclick={() => personDialog?.show(null)}>
				<Plus /> Person hinzufügen
			</Button>
		</div>
	</Card.Header>
	<Card.Content>
		{#if people.length === 0}
			<div
				class="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center"
			>
				<Users class="size-8 text-muted-foreground" aria-hidden="true" />
				<p class="text-sm text-muted-foreground">
					Noch keine Person angelegt. Lege eine Person an, um Stellen und Betriebe zu verwalten.
				</p>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each people as person (person.id)}
					<li class="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<span
								class={[
									'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
									personColor(person.color).soft
								]}
								aria-hidden="true"
							>
								{personInitials(person.name)}
							</span>
							<div class="min-w-0">
								<p class="truncate font-medium">{person.name}</p>
								<p class="text-xs text-muted-foreground">{counts(person)}</p>
							</div>
						</div>
						<div class="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
							<Button
								href={`/p/${person.slug}`}
								variant="outline"
								size="sm"
								class="w-full sm:w-auto"
							>
								<ExternalLink /> Öffnen
							</Button>
							<Button
								variant="outline"
								size="sm"
								class="w-full sm:w-auto"
								onclick={() => personDialog?.show(person)}
							>
								<Pencil /> Bearbeiten
							</Button>
							<Button
								variant="destructive"
								size="sm"
								class="w-full sm:w-auto"
								onclick={() => askDelete(person)}
							>
								<Trash2 /> Löschen
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>

<PersonDialog bind:this={personDialog} data={personForm} />

{#if target}
	<IdActionForm
		action="deletePerson"
		id={target.id}
		bind:element={deleteForm}
		bind:pending={deleting}
		ondone={(ok) => {
			if (ok) confirmOpen = false;
		}}
	/>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={target ? `Person „${target.name}“ löschen?` : 'Person löschen?'}
	actions={[
		{
			label: 'Löschen',
			variant: 'destructive',
			icon: Trash2,
			loading: deleting,
			onclick: () => deleteForm?.requestSubmit()
		}
	]}
>
	{#snippet description()}
		Alle Stellen, Betriebe, Bewerbungen und der Lebenslauf dieser Person werden gelöscht. Das kann
		nicht rückgängig gemacht werden.
	{/snippet}
	{#snippet info()}
		{#if target}
			Betroffen: {counts(target)}
		{/if}
	{/snippet}
</ConfirmDialog>
