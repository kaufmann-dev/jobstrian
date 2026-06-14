<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { leadContactFormSchema } from '$lib/lead-contact';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ServerDataTable from '$lib/components/server-data-table.svelte';
	import { ServerListController } from '$lib/components/server-list-controller.svelte.js';
	import { renderSnippet } from '$lib/components/ui/data-table/render-helpers.js';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Globe from '@lucide/svelte/icons/globe';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Star from '@lucide/svelte/icons/star';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import type { Lead } from '$lib/server/db/schema';

	let { data } = $props();

	const controller = new ServerListController<Lead>(
		'/api/leads',
		untrack(() => data.page),
		{ sort: 'recommended', onlyOpen: 'true', hideIgnored: 'true' }
	);
	let onlyWithEmail = $state(false);
	let onlyOpen = $state(true);
	let hideIgnored = $state(true);
	let selected = $state<Lead | null>(null);
	let editingContact = $state(false);
	let contactSaving = $state(false);

	const contactForm = superForm(
		{ phone: '', email: '', website: '' },
		{
			id: 'lead-contact',
			validators: zod4Client(leadContactFormSchema),
			resetForm: false
		}
	);
	const { form: contactData, errors: contactErrors } = contactForm;

	function resetFilters(): void {
		onlyWithEmail = false;
		onlyOpen = true;
		hideIgnored = true;
		selected = null;
	}

	function selectLead(item: Lead): void {
		selected = item;
		editingContact = false;
	}

	function closeDetails(): void {
		selected = null;
		editingContact = false;
	}

	function beginContactEdit(): void {
		if (!selected) return;
		contactForm.reset({
			data: {
				phone: selected.phone ?? '',
				email: selected.email ?? '',
				website: selected.website ?? ''
			}
		});
		editingContact = true;
	}

	function cancelContactEdit(): void {
		editingContact = false;
		contactForm.reset();
	}

	async function responseMessage(response: Response, fallback: string): Promise<string> {
		const body = (await response.json().catch(() => ({}))) as { message?: string };
		return body.message ?? fallback;
	}

	async function saveContact(): Promise<void> {
		if (!selected) return;
		const validation = await contactForm.validateForm({ update: true });
		if (!validation.valid) return;

		const phone = validation.data.phone?.trim() || null;
		const email = validation.data.email?.trim().toLowerCase() || null;
		const website = validation.data.website?.trim() || null;
		const patch: { phone?: string | null; email?: string | null; website?: string | null } = {};
		if (phone !== selected.phone) patch.phone = phone;
		if (email !== selected.email) patch.email = email;
		if (website !== selected.website) patch.website = website;
		if (patch.phone === undefined && patch.email === undefined && patch.website === undefined) {
			editingContact = false;
			return;
		}

		contactSaving = true;
		try {
			const response = await fetch(`/api/leads/${selected.id}/contact`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Kontaktdaten konnten nicht gespeichert werden.')
				);
			}
			const updated = (await response.json()) as Lead;
			selected = updated;
			controller.patch(
				(item) => item.id === updated.id,
				() => updated
			);
			editingContact = false;
			await controller.reset();
			toast.success('Kontaktdaten gespeichert');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Kontaktdaten konnten nicht gespeichert werden.'
			);
		} finally {
			contactSaving = false;
		}
	}

	/** Client-side mirror of the server's "recommended" order, for instant reordering on star. */
	function recommendedCompare(a: Lead, b: Lead): number {
		if (a.starred !== b.starred) return a.starred ? -1 : 1;
		if (a.rankScore !== b.rankScore) {
			if (a.rankScore == null) return 1;
			if (b.rankScore == null) return -1;
			return b.rankScore - a.rankScore;
		}
		if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
		return a.id - b.id;
	}

	async function toggleStar(item: Lead): Promise<void> {
		const starred = !item.starred;
		controller.patch(
			(row) => row.id === item.id,
			(row) => ({ ...row, starred })
		);
		if (selected?.id === item.id) selected = { ...selected, starred };
		if (controller.sort === 'recommended') controller.reorder(recommendedCompare);
		const response = await fetch(`/api/leads/${item.id}/star`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ starred })
		});
		if (!response.ok) {
			controller.patch(
				(row) => row.id === item.id,
				(row) => ({ ...row, starred: !starred })
			);
			if (selected?.id === item.id) selected = { ...selected, starred: !starred };
			if (controller.sort === 'recommended') controller.reorder(recommendedCompare);
			toast.error('Markierung konnte nicht gespeichert werden.');
		}
	}

	async function copy(text: string, what: string): Promise<void> {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} kopiert`);
	}

	async function setStatus(item: Lead, status: Lead['status']): Promise<void> {
		const response = await fetch(`/api/leads/${item.id}/status`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status })
		});
		if (!response.ok) {
			toast.error('Status konnte nicht gespeichert werden.');
			return;
		}
		await controller.reset();
		selected = null;
	}

	function mailtoHref(item: Lead): string {
		// encodeURIComponent instead of URLSearchParams: mail clients do not
		// decode "+" as space in mailto URLs.
		const params: string[] = [];
		if (item.draftSubject) params.push(`subject=${encodeURIComponent(item.draftSubject)}`);
		if (item.draftBody) params.push(`body=${encodeURIComponent(item.draftBody)}`);
		return `mailto:${item.email}${params.length ? '?' + params.join('&') : ''}`;
	}

	function fmtDistance(meters: number): string {
		if (meters < 1000) return `${meters} m`;
		return `${(meters / 1000).toLocaleString('de-AT', { maximumFractionDigits: 1 })} km`;
	}

	const STATUS_LABELS: Record<Lead['status'], string> = {
		new: 'neu',
		contacted: 'kontaktiert',
		ignored: 'ignoriert'
	};

	const CATEGORY_LABELS: Record<string, string> = {
		restaurant: 'Restaurant',
		cafe: 'Café',
		bar: 'Bar',
		pub: 'Pub',
		fast_food: 'Imbiss / Fast Food',
		ice_cream: 'Eissalon',
		biergarten: 'Biergarten',
		food_court: 'Food Court',
		bakery: 'Bäckerei',
		confectionery: 'Konditorei',
		canteen: 'Kantine'
	};

	function fmtCategory(category: string | null): string {
		if (!category) return 'Betrieb';
		return CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
	}

	function scoreClass(score: number): string {
		if (score >= 80)
			return 'border-transparent bg-emerald-600/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300';
		if (score >= 60)
			return 'border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300';
		return 'border-transparent bg-muted text-muted-foreground';
	}

	const columns: ColumnDef<Lead>[] = [
		{
			id: 'star',
			header: '',
			cell: ({ row }) => renderSnippet(starCell, { item: row.original }),
			meta: { class: 'w-10 px-1' }
		},
		{
			id: 'score',
			header: 'Score',
			cell: ({ row }) => renderSnippet(scoreCell, { item: row.original }),
			meta: {
				class: 'w-16',
				sort: { asc: 'score-asc', desc: 'score-desc', initial: 'desc' }
			}
		},
		{
			id: 'business',
			header: 'Betrieb',
			cell: ({ row }) => renderSnippet(businessCell, { item: row.original }),
			meta: {
				class: 'w-auto whitespace-normal',
				sort: { asc: 'name-asc', desc: 'name-desc', initial: 'asc' }
			}
		},
		{
			id: 'distance',
			header: 'Entfernung',
			cell: ({ row }) => fmtDistance(row.original.distanceMeters),
			meta: {
				class: 'w-24',
				sort: { asc: 'distance-asc', desc: 'distance-desc', initial: 'asc' }
			}
		},
		{
			id: 'contact',
			header: 'Kontakt',
			cell: ({ row }) => renderSnippet(contactCell, { item: row.original }),
			meta: { class: 'hidden w-36 md:table-cell' }
		},
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }) => renderSnippet(statusCell, { item: row.original }),
			meta: {
				class: 'hidden w-52 lg:table-cell',
				sort: { asc: 'status-asc', desc: 'status-desc', initial: 'asc' }
			}
		}
	];
</script>

{#snippet scoreCell({ item }: { item: Lead })}
	{#if item.rankScore != null}
		<Badge class={['tabular-nums', scoreClass(item.rankScore)]}>{item.rankScore}</Badge>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet businessCell({ item }: { item: Lead })}
	<div class="max-w-md whitespace-normal">
		<p class="font-medium">{item.name}</p>
		<p class="text-xs text-muted-foreground">{fmtCategory(item.category)}</p>
	</div>
{/snippet}

{#snippet contactCell({ item }: { item: Lead })}
	<div class="flex flex-wrap items-center gap-1">
		{#if item.email}
			<Badge><Mail class="size-3" /> E-Mail</Badge>
		{/if}
		{#if item.phone}
			<Badge variant="outline"><Phone class="size-3" /> Telefon</Badge>
		{/if}
		{#if !item.email && !item.phone}
			<span class="text-xs text-muted-foreground">—</span>
		{/if}
	</div>
{/snippet}

{#snippet statusCell({ item }: { item: Lead })}
	<div class="flex flex-wrap gap-1">
		{#if item.hasActivePosting}<Badge variant="secondary">hat Ausschreibung</Badge>{/if}
		{#if item.status === 'contacted'}<Badge>kontaktiert</Badge>{/if}
		{#if item.status === 'ignored'}<Badge variant="destructive">ignoriert</Badge>{/if}
		{#if item.status === 'new'}<Badge variant="outline">neu</Badge>{/if}
	</div>
{/snippet}

{#snippet starCell({ item }: { item: Lead })}
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={item.starred ? 'Markierung entfernen' : 'Betrieb markieren'}
		onclick={(event) => {
			event.stopPropagation();
			toggleStar(item);
		}}
	>
		<Star class={['size-4', item.starred && 'fill-amber-400 text-amber-500']} />
	</Button>
{/snippet}

<div class="space-y-5">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Betriebe in der Nähe</h1>
		<p class="text-sm text-muted-foreground">
			Konfigurierte Betriebe im Umkreis deines Wohnorts · ideal für Initiativbewerbungen.
		</p>
	</div>

	{#snippet filters()}
		<label class="flex items-center gap-2">
			<Checkbox
				checked={onlyWithEmail}
				onCheckedChange={(checked) => {
					onlyWithEmail = checked;
					void controller.reset({ onlyWithEmail: checked ? 'true' : null });
					selected = null;
				}}
			/>
			Nur mit E-Mail
		</label>
		<label class="flex items-center gap-2">
			<Checkbox
				checked={onlyOpen}
				onCheckedChange={(checked) => {
					onlyOpen = checked;
					void controller.reset({ onlyOpen: String(checked) });
					selected = null;
				}}
			/>
			Nur ohne Ausschreibung
		</label>
		<label class="flex items-center gap-2">
			<Checkbox
				checked={hideIgnored}
				onCheckedChange={(checked) => {
					hideIgnored = checked;
					void controller.reset({ hideIgnored: String(checked) });
					selected = null;
				}}
			/>
			Ignorierte ausblenden
		</label>
	{/snippet}

	<ServerDataTable
		{controller}
		{columns}
		{filters}
		onRowClick={selectLead}
		onResetFilters={resetFilters}
		searchPlaceholder="Betrieb, Kategorie, Adresse oder E-Mail suchen"
		defaultSort="recommended"
		itemLabel="Betrieben"
		emptyText="Noch keine Betriebe. Trage Adresse und Betriebskategorien in den Einstellungen ein und aktualisiere."
	/>
</div>

<Sheet.Root open={selected !== null} onOpenChange={(open) => !open && closeDetails()}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-xl">
		{#if selected}
			<Sheet.Header>
				<Sheet.Title>{selected.name}</Sheet.Title>
				<Sheet.Description
					>{fmtCategory(selected.category)} · {fmtDistance(
						selected.distanceMeters
					)}</Sheet.Description
				>
			</Sheet.Header>
			<div class="space-y-5 px-4 pb-4">
				<div class="flex flex-wrap gap-2">
					{#if selected.rankScore != null}<Badge>Score {selected.rankScore}</Badge>{/if}
					{#if selected.hasActivePosting}<Badge variant="secondary">hat Ausschreibung</Badge>{/if}
					<Badge variant="outline">{STATUS_LABELS[selected.status] ?? selected.status}</Badge>
				</div>
				{#if selected.rankReason}<p class="text-sm text-muted-foreground">
						{selected.rankReason}
					</p>{/if}
				<div class="space-y-3 text-sm">
					{#if selected.address}<p>{selected.address}</p>{/if}
					<div class="flex items-center justify-between gap-3">
						<p class="font-medium">Kontakt</p>
						{#if !editingContact}
							<Button variant="ghost" size="sm" onclick={beginContactEdit}>
								<Pencil class="size-4" /> Bearbeiten
							</Button>
						{/if}
					</div>
					{#if editingContact}
						<form
							class="space-y-3 rounded-xl border p-3"
							onsubmit={(event) => {
								event.preventDefault();
								void saveContact();
							}}
						>
							<div class="space-y-1">
								<Label for="contact-phone">Telefon</Label>
								<Input
									id="contact-phone"
									type="tel"
									bind:value={$contactData.phone}
									aria-invalid={Boolean($contactErrors.phone)}
								/>
								{#if $contactErrors.phone}
									<p class="text-xs text-destructive">{$contactErrors.phone.join(' ')}</p>
								{/if}
							</div>
							<div class="space-y-1">
								<Label for="contact-email">E-Mail</Label>
								<Input
									id="contact-email"
									type="email"
									bind:value={$contactData.email}
									aria-invalid={Boolean($contactErrors.email)}
								/>
								{#if $contactErrors.email}
									<p class="text-xs text-destructive">{$contactErrors.email.join(' ')}</p>
								{/if}
							</div>
							<div class="space-y-1">
								<Label for="contact-website">Website</Label>
								<Input
									id="contact-website"
									type="url"
									bind:value={$contactData.website}
									aria-invalid={Boolean($contactErrors.website)}
								/>
								{#if $contactErrors.website}
									<p class="text-xs text-destructive">{$contactErrors.website.join(' ')}</p>
								{/if}
							</div>
							<p class="text-xs text-muted-foreground">
								Leere Felder werden gelöscht und bei Aktualisierungen nicht erneut befüllt.
							</p>
							<div class="flex justify-end gap-2">
								<Button variant="ghost" onclick={cancelContactEdit} disabled={contactSaving}>
									<X class="size-4" /> Abbrechen
								</Button>
								<Button type="submit" disabled={contactSaving}>
									{#if contactSaving}<Spinner class="size-4" />{:else}<Save class="size-4" />{/if}
									Speichern
								</Button>
							</div>
						</form>
					{:else}
						<div class="space-y-2">
							{#if selected.email}
								<button
									class="flex items-center gap-2 underline"
									onclick={() => copy(selected!.email!, 'E-Mail')}
								>
									<Mail class="size-4" />
									{selected.email}
								</button>
							{:else}
								<p class="flex items-center gap-2 text-muted-foreground">
									<Mail class="size-4" /> Keine E-Mail
								</p>
							{/if}
							{#if selected.phone}
								<p class="flex items-center gap-2">
									<Phone class="size-4" />
									{selected.phone}
								</p>
							{:else}
								<p class="flex items-center gap-2 text-muted-foreground">
									<Phone class="size-4" /> Kein Telefon
								</p>
							{/if}
							{#if selected.website}
								<Button
									variant="link"
									href={selected.website}
									target="_blank"
									class="h-auto p-0 font-normal"
								>
									<Globe class="size-4" /> Website
								</Button>
							{:else}
								<p class="flex items-center gap-2 text-muted-foreground">
									<Globe class="size-4" /> Keine Website
								</p>
							{/if}
						</div>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					{#if selected.status !== 'new'}
						<Button variant="outline" onclick={() => setStatus(selected!, 'new')}
							>Zurücksetzen</Button
						>
					{/if}
					{#if selected.status !== 'contacted'}
						<Button variant="outline" onclick={() => setStatus(selected!, 'contacted')}
							>Kontaktiert</Button
						>
					{/if}
					{#if selected.status !== 'ignored'}
						<Button variant="ghost" onclick={() => setStatus(selected!, 'ignored')}>Ignorieren</Button
						>
					{/if}
				</div>
				{#if selected.draftBody}
					<div class="space-y-3 border-t pt-4">
						<div class="space-y-1">
							<Label for="subj">Betreff</Label>
							<div class="flex gap-2">
								<Input id="subj" readonly value={selected.draftSubject ?? ''} />
								<Button
									variant="outline"
									size="icon"
									onclick={() => copy(selected!.draftSubject ?? '', 'Betreff')}
								>
									<Copy class="size-4" />
								</Button>
							</div>
						</div>
						<div class="space-y-1">
							<Label for="body">Nachricht</Label>
							<Textarea id="body" readonly rows={10} value={selected.draftBody} />
						</div>
						{#if data.hasCv}
							<a href={resolve('/api/cv')} class="flex items-center gap-2 text-sm underline">
								<Paperclip class="size-4" />
								<Download class="size-4" /> Lebenslauf herunterladen
							</a>
						{/if}
						<div class="flex gap-2">
							<Button class="flex-1" onclick={() => copy(selected!.draftBody ?? '', 'Nachricht')}>
								<Copy class="size-4" /> Text kopieren
							</Button>
							{#if selected.email}
								<Button class="flex-1" variant="outline" href={mailtoHref(selected)}>
									<Mail class="size-4" /> In E-Mail öffnen
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
