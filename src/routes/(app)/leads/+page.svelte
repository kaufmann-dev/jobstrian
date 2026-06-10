<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Globe from '@lucide/svelte/icons/globe';
	import Copy from '@lucide/svelte/icons/copy';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Download from '@lucide/svelte/icons/download';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import type { Lead } from '$lib/server/db/schema';

	let { data } = $props();

	let onlyWithEmail = $state(false);
	let onlyOpen = $state(true);
	let hideIgnored = $state(true);
	let draftLead = $state<Lead | null>(null);

	const filtered = $derived(
		data.leads.filter((l) => {
			if (onlyWithEmail && !l.email) return false;
			if (onlyOpen && l.hasActivePosting) return false;
			if (hideIgnored && l.status === 'ignored') return false;
			return true;
		})
	);

	async function copy(text: string, what: string) {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} kopiert`);
	}

	function mailtoHref(l: Lead): string {
		const params = new URLSearchParams();
		if (l.draftSubject) params.set('subject', l.draftSubject);
		if (l.draftBody) params.set('body', l.draftBody);
		const q = params.toString();
		return `mailto:${l.email}${q ? '?' + q : ''}`;
	}
</script>

<div class="space-y-4">
	<div>
		<h1 class="text-2xl font-semibold">Betriebe in der Nähe</h1>
		<p class="text-sm text-muted-foreground">
			Gastronomie im Umkreis deines Wohnorts — ideal für Initiativbewerbungen.
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-4 text-sm">
		<label class="flex items-center gap-2"
			><Checkbox bind:checked={onlyWithEmail} /> Nur mit E-Mail</label
		>
		<label class="flex items-center gap-2">
			<Checkbox bind:checked={onlyOpen} /> Nur ohne Ausschreibung
		</label>
		<label class="flex items-center gap-2"
			><Checkbox bind:checked={hideIgnored} /> Ignorierte ausblenden</label
		>
		<span class="ml-auto text-muted-foreground">{filtered.length} Betriebe</span>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each filtered as l (l.id)}
			<Card.Root class={l.status === 'contacted' ? 'border-primary' : ''}>
				<Card.Header>
					<div class="flex items-start justify-between gap-2">
						<Card.Title class="text-base">{l.name}</Card.Title>
						{#if l.rankScore != null}<Badge>{l.rankScore}</Badge>{/if}
					</div>
					<Card.Description class="flex items-center gap-1">
						<MapPin class="size-3" />
						{l.distanceMeters} m · {l.category}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2 text-sm">
					{#if l.address}<p class="text-muted-foreground">{l.address}</p>{/if}
					<div class="flex flex-wrap gap-1">
						{#if l.hasActivePosting}
							<Badge variant="secondary">hat Ausschreibung</Badge>
						{:else}
							<Badge variant="outline">keine Ausschreibung</Badge>
						{/if}
						{#if l.status === 'contacted'}<Badge>kontaktiert</Badge>{/if}
						{#if l.status === 'ignored'}<Badge variant="destructive">ignoriert</Badge>{/if}
					</div>
					<div class="flex flex-wrap gap-2 pt-1">
						{#if l.email}
							<button
								class="inline-flex items-center gap-1 underline"
								onclick={() => copy(l.email!, 'E-Mail')}
							>
								<Mail class="size-3" />
								{l.email}
							</button>
						{/if}
						{#if l.phone}
							<span class="inline-flex items-center gap-1"><Phone class="size-3" /> {l.phone}</span>
						{/if}
						{#if l.website}
							<a class="inline-flex items-center gap-1 underline" href={l.website} target="_blank">
								<Globe class="size-3" /> Website
							</a>
						{/if}
					</div>
				</Card.Content>
				<Card.Footer class="gap-2">
					<Button
						size="sm"
						variant="default"
						disabled={!l.draftBody}
						onclick={() => (draftLead = l)}
					>
						<Mail class="size-4" /> Entwurf
					</Button>
					<form method="POST" action="?/setStatus" use:enhance class="flex gap-1">
						<input type="hidden" name="id" value={l.id} />
						<Button
							type="submit"
							name="status"
							value={l.status === 'contacted' ? 'new' : 'contacted'}
							size="sm"
							variant="outline"
						>
							{l.status === 'contacted' ? 'Zurücksetzen' : 'Kontaktiert'}
						</Button>
						<Button type="submit" name="status" value="ignored" size="sm" variant="ghost">
							Ignorieren
						</Button>
					</form>
				</Card.Footer>
			</Card.Root>
		{:else}
			<p class="text-muted-foreground col-span-full py-8 text-center">
				Noch keine Betriebe. Trage deinen Wohnort in den Einstellungen ein und aktualisiere.
			</p>
		{/each}
	</div>
</div>

<Dialog.Root open={draftLead !== null} onOpenChange={(o) => !o && (draftLead = null)}>
	<Dialog.Content class="max-w-lg">
		{#if draftLead}
			<Dialog.Header>
				<Dialog.Title>Entwurf — {draftLead.name}</Dialog.Title>
				<Dialog.Description>{draftLead.email ?? 'Keine E-Mail-Adresse gefunden'}</Dialog.Description
				>
			</Dialog.Header>
			<div class="space-y-3">
				<div class="space-y-1">
					<Label for="subj">Betreff</Label>
					{#if data.hasCv}
					<div
						class="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md border p-2 text-xs"
					>
						<Paperclip class="size-3.5" /> Lebenslauf nicht vergessen anzuhängen.
						<a href="/api/cv" class="ml-auto inline-flex items-center gap-1 underline">
							<Download class="size-3.5" /> Lebenslauf
						</a>
					</div>
				{/if}
				<div class="flex gap-2">
						<Input id="subj" readonly value={draftLead.draftSubject ?? ''} />
						<Button
							variant="outline"
							size="icon"
							onclick={() => copy(draftLead!.draftSubject ?? '', 'Betreff')}
						>
							<Copy class="size-4" />
						</Button>
					</div>
				</div>
				<div class="space-y-1">
					<Label for="body">Nachricht</Label>
					<Textarea id="body" readonly rows={10} value={draftLead.draftBody ?? ''} />
				</div>
				<div class="flex gap-2">
					<Button class="flex-1" onclick={() => copy(draftLead!.draftBody ?? '', 'Nachricht')}>
						<Copy class="size-4" /> Text kopieren
					</Button>
					{#if draftLead.email}
						<Button class="flex-1" variant="outline" href={mailtoHref(draftLead)}>
							<Mail class="size-4" /> In E-Mail öffnen
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
