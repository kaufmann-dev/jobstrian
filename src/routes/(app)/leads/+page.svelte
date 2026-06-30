<script lang="ts">
	import type { ColumnDef } from '@tanstack/table-core';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { leadContactFormSchema } from '$lib/lead-contact';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import PageHeader from '$lib/components/page-header.svelte';
	import RunStatusCard, { type RunStatusCardPhase } from '$lib/components/run-status-card.svelte';
	import ServerDataTable from '$lib/components/server-data-table.svelte';
	import TableFilterCheckbox from '$lib/components/table-filter-checkbox.svelte';
	import RankFactors from '$lib/components/rank-factors.svelte';
	import { rankScoreClass } from '$lib/rank-color';
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
	import Send from '@lucide/svelte/icons/send';
	import Clock from '@lucide/svelte/icons/clock';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { Lead } from '$lib/server/db/schema';
	import type {
		ApplicationEmailPhaseId,
		ApplicationEmailProgress,
		ApplicationEmailRun
	} from '$lib/server/db/schema';

	const viennaDateTime = new Intl.DateTimeFormat('de-AT', {
		timeZone: 'Europe/Vienna',
		dateStyle: 'medium',
		timeStyle: 'medium'
	});

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
	let polledEmailRun = $state.raw<ApplicationEmailRun | null>(
		untrack(() => data.applicationEmail.latestRun)
	);
	let emailConfirmOpen = $state(false);
	let emailStarting = $state(false);
	let emailCanceling = $state(false);
	let emailPolling = false;
	let stopped = false;

	const emailRun = $derived(polledEmailRun ?? data.applicationEmail.latestRun);
	const emailRunActive = $derived(
		emailRun?.status === 'running' || emailRun?.status === 'canceling' || emailStarting
	);
	const emailProgress = $derived(normalizeEmailProgress(emailRun));
	const emailPhaseRows = $derived(toEmailPhaseRows(emailProgress));
	const activeEmailPhase = $derived(emailPhaseRows.find((p) => p.state === 'running'));
	const canStartEmailRun = $derived(
		data.applicationEmail.ready &&
			data.applicationEmail.eligibleCount > 0 &&
			!emailRunActive &&
			!emailStarting
	);

	const contactForm = superForm(
		{ phone: '', email: '', website: '' },
		{
			id: 'lead-contact',
			validators: zod4Client(leadContactFormSchema),
			resetForm: false
		}
	);
	const { form: contactData, errors: contactErrors } = contactForm;

	type EmailPhaseRow = RunStatusCardPhase & { id: ApplicationEmailPhaseId };

	const emailPhaseLabels: Record<ApplicationEmailPhaseId, string> = {
		setup: 'Vorbereitung',
		queue: 'Einplanung',
		send: 'Versand',
		finalize: 'Abschluss'
	};

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
			const updated = (await response.json()) as Lead & { draftWarning?: string | null };
			selected = updated;
			controller.patch(
				(item) => item.id === updated.id,
				() => updated
			);
			editingContact = false;
			await controller.reset();
			toast.success('Kontaktdaten gespeichert');
			if (updated.draftWarning) toast.warning(updated.draftWarning);
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

	function fallbackEmailProgress(currentRun: ApplicationEmailRun | null): ApplicationEmailProgress {
		return {
			version: 1,
			headline: currentRun?.phase ?? 'Kein Bewerbungsversand',
			detail: currentRun?.error ?? '',
			nextSendAt: null,
			phases: {
				setup: {
					state: currentRun ? 'done' : 'pending',
					current: currentRun ? 1 : 0,
					total: 1,
					detail: '',
					skipped: 0,
					failed: 0
				},
				queue: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				send: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 },
				finalize: { state: 'pending', current: 0, total: 0, detail: '', skipped: 0, failed: 0 }
			}
		};
	}

	function normalizeEmailProgress(
		currentRun: ApplicationEmailRun | null
	): ApplicationEmailProgress {
		const fallback = fallbackEmailProgress(currentRun);
		const stored = currentRun?.progress as Partial<ApplicationEmailProgress> | null | undefined;
		if (stored?.version !== 1) return fallback;
		return {
			...fallback,
			...stored,
			headline: stored.headline ?? fallback.headline,
			detail: stored.detail ?? fallback.detail,
			nextSendAt: stored.nextSendAt ?? null,
			phases: {
				setup: { ...fallback.phases.setup, ...stored.phases?.setup },
				queue: { ...fallback.phases.queue, ...stored.phases?.queue },
				send: { ...fallback.phases.send, ...stored.phases?.send },
				finalize: { ...fallback.phases.finalize, ...stored.phases?.finalize }
			}
		};
	}

	function toEmailPhaseRows(progress: ApplicationEmailProgress): EmailPhaseRow[] {
		return (Object.keys(emailPhaseLabels) as ApplicationEmailPhaseId[]).map((id) => ({
			id,
			label: emailPhaseLabels[id],
			...progress.phases[id]
		}));
	}

	function emailStatusLabel(status: ApplicationEmailRun['status'] | undefined): string {
		if (status === 'running') return 'läuft';
		if (status === 'canceling') return 'bricht ab';
		if (status === 'canceled') return 'abgebrochen';
		if (status === 'done') return 'fertig';
		if (status === 'error') return 'Fehler';
		return 'bereit';
	}

	function emailStatusVariant(
		status: ApplicationEmailRun['status'] | undefined
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'error') return 'destructive';
		return 'secondary';
	}

	async function startApplicationEmailRun(): Promise<void> {
		if (!canStartEmailRun) return;
		emailStarting = true;
		try {
			const response = await fetch('/api/application-emails/start', { method: 'POST' });
			const body = (await response.json().catch(() => ({}))) as {
				started?: boolean;
				message?: string;
			};
			if (!response.ok || !body.started) {
				throw new Error(body.message ?? 'Bewerbungsversand konnte nicht gestartet werden.');
			}
			emailConfirmOpen = false;
			toast.success('Bewerbungsversand gestartet');
			void pollApplicationEmailRun();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Bewerbungsversand konnte nicht gestartet werden.'
			);
		} finally {
			emailStarting = false;
		}
	}

	async function pollApplicationEmailRun(): Promise<void> {
		if (emailPolling) return;
		emailPolling = true;
		let finalRun: ApplicationEmailRun | null = null;
		try {
			while (!stopped) {
				const response = await fetch('/api/application-emails/status');
				const body = (await response.json()) as { run: ApplicationEmailRun | null };
				polledEmailRun = body.run;
				finalRun = polledEmailRun;
				if (
					!polledEmailRun ||
					(polledEmailRun.status !== 'running' && polledEmailRun.status !== 'canceling')
				) {
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		} finally {
			emailPolling = false;
			await invalidateAll();
			if (finalRun?.status === 'done') toast.success('Bewerbungsversand abgeschlossen');
			if (finalRun?.status === 'canceled') toast.info('Bewerbungsversand abgebrochen');
			if (finalRun?.status === 'error')
				toast.error(finalRun.error ?? 'Bewerbungsversand fehlgeschlagen');
		}
	}

	async function cancelApplicationEmailRun(): Promise<void> {
		if (!emailRun) return;
		emailCanceling = true;
		try {
			await fetch('/api/application-emails/cancel', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ runId: emailRun.id })
			});
			void pollApplicationEmailRun();
		} finally {
			emailCanceling = false;
		}
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

	onMount(() => {
		if (emailRun?.status === 'running' || emailRun?.status === 'canceling') {
			void pollApplicationEmailRun();
		}
		return () => {
			stopped = true;
		};
	});
</script>

<svelte:head>
	<title>Betriebe · Jobstrian</title>
	<meta
		name="description"
		content="Verwalte Betriebe und Kontaktdaten und nimm direkt Kontakt zu passenden Arbeitgebern auf."
	/>
</svelte:head>

{#snippet scoreCell({ item }: { item: Lead })}
	{#if item.rankScore != null}
		<Badge class={['tabular-nums', rankScoreClass(item.rankScore)]}>{item.rankScore}</Badge>
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
	<PageHeader
		title="Betriebe in der Nähe"
		description="Konfigurierte Betriebe im Umkreis deines Wohnorts · ideal für Initiativbewerbungen."
	>
		{#snippet actions()}
			<Button
				class="w-full sm:w-auto"
				disabled={!canStartEmailRun}
				onclick={() => (emailConfirmOpen = true)}
				size="lg"
				title={!data.applicationEmail.ready
					? data.applicationEmail.reasons.join(' ')
					: data.applicationEmail.eligibleCount === 0
						? 'Keine neuen Betriebe mit E-Mail und Entwurf offen.'
						: undefined}
			>
				{#if emailRunActive}<Spinner class="size-4" />{:else}<Send class="size-4" />{/if}
				Bewerbungen senden
			</Button>
		{/snippet}
	</PageHeader>

	{#if !data.applicationEmail.ready}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Automatischer E-Mail-Versand ist nicht bereit</Alert.Title>
			<Alert.Description>{data.applicationEmail.reasons.join(' ')}</Alert.Description>
		</Alert.Root>
	{:else}
		<RunStatusCard
			title="Automatischer Bewerbungsversand"
			statusLabel={emailStatusLabel(emailRun?.status)}
			statusVariant={emailStatusVariant(emailRun?.status)}
			active={emailRunActive}
			phases={emailPhaseRows}
			summary={emailRunActive
				? `${activeEmailPhase?.label ?? 'Bewerbungsversand'} · ${activeEmailPhase?.detail || emailProgress.detail || 'Bereit'}`
				: undefined}
		>
			{#snippet actions()}
				{#if emailRunActive && emailRun}
					<Button
						variant="outline"
						size="sm"
						class="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
						aria-label="Abbrechen"
						disabled={emailCanceling || emailRun.status === 'canceling'}
						onclick={cancelApplicationEmailRun}
					>
						{#if emailCanceling || emailRun.status === 'canceling'}
							<Spinner class="size-4" />
						{:else}
							<X class="size-4" />
						{/if}
						<span class="hidden sm:inline">Abbrechen</span>
					</Button>
				{/if}
			{/snippet}

			{#snippet details()}
				{#if emailRun}
					<div class="space-y-2 border-t pt-3 text-sm text-muted-foreground">
						<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<span>{emailProgress.headline}</span>
							{#if emailProgress.nextSendAt}
								<span class="flex items-center gap-1">
									<Clock class="size-4 shrink-0" />
									Nächste E-Mail: {viennaDateTime.format(new Date(emailProgress.nextSendAt))}
								</span>
							{/if}
						</div>
						{#if !emailProgress.nextSendAt && emailProgress.detail}
							<p>{emailProgress.detail}</p>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">
						{emailRun.counts.sent} gesendet · {emailRun.counts.failed} fehlgeschlagen ·
						{emailRun.counts.queued} offen
					</p>
				{/if}
			{/snippet}
		</RunStatusCard>
	{/if}

	{#snippet filters()}
		<TableFilterCheckbox
			checked={onlyWithEmail}
			onCheckedChange={(checked) => {
				onlyWithEmail = checked;
				void controller.reset({ onlyWithEmail: checked ? 'true' : null });
				selected = null;
			}}
		>
			Nur mit E-Mail
		</TableFilterCheckbox>
		<TableFilterCheckbox
			checked={onlyOpen}
			onCheckedChange={(checked) => {
				onlyOpen = checked;
				void controller.reset({ onlyOpen: String(checked) });
				selected = null;
			}}
		>
			Nur ohne Ausschreibung
		</TableFilterCheckbox>
		<TableFilterCheckbox
			checked={hideIgnored}
			onCheckedChange={(checked) => {
				hideIgnored = checked;
				void controller.reset({ hideIgnored: String(checked) });
				selected = null;
			}}
		>
			Ignorierte ausblenden
		</TableFilterCheckbox>
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

<Dialog.Root bind:open={emailConfirmOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Bewerbungen automatisch senden?</Dialog.Title>
			<Dialog.Description>
				{data.applicationEmail.eligibleCount} neue Betriebe werden eingeplant. Der Versand läuft nur Montag
				bis Freitag von 09:00 bis 18:00 Uhr, mit 30 bis 90 Sekunden Abstand und einem täglichen Sendelimit.
			</Dialog.Description>
		</Dialog.Header>
		<div class="rounded-lg border p-3 text-sm text-muted-foreground">
			Jeder Betrieb wird höchstens einmal angeschrieben. Wiederholtes Drücken startet keine zweite
			E-Mail für denselben Betrieb.
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (emailConfirmOpen = false)}>Abbrechen</Button>
			<Button disabled={emailStarting} onclick={startApplicationEmailRun}>
				{#if emailStarting}<Spinner />{:else}<Send />{/if}
				Starten
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
					{#if selected.rankScore != null}<Badge class={rankScoreClass(selected.rankScore)}
							>Score {selected.rankScore}</Badge
						>{/if}
					{#if selected.hasActivePosting}<Badge variant="secondary">hat Ausschreibung</Badge>{/if}
					<Badge variant="outline">{STATUS_LABELS[selected.status] ?? selected.status}</Badge>
				</div>
				{#if selected.rankFactors?.length}
					<RankFactors factors={selected.rankFactors} />
				{:else if selected.rankReason}
					<div>
						<h3 class="mb-1 text-sm font-medium">Bewertung</h3>
						<p class="text-sm text-muted-foreground">{selected.rankReason}</p>
					</div>
				{/if}
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
						<Button variant="ghost" onclick={() => setStatus(selected!, 'ignored')}
							>Ignorieren</Button
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
						<div class="flex flex-col gap-2">
							<Button class="w-full" onclick={() => copy(selected!.draftBody ?? '', 'Nachricht')}>
								<Copy class="size-4" /> Text kopieren
							</Button>
							{#if selected.email}
								<Button class="w-full" variant="outline" href={mailtoHref(selected)}>
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
