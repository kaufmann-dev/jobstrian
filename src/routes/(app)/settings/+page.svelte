<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { settingsSchema } from './schema';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let { data } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(settingsSchema),
		onUpdated: ({ form: f }) => {
			if (f.valid) toast.success('Einstellungen gespeichert');
		}
	});
	const { form: formData, enhance, submitting } = form;

	const sources = [
		{ name: 'sourceHokify', label: 'hokify (deaktiviert empfohlen)' },
		{ name: 'sourceWillhaben', label: 'willhaben Jobs' },
		{ name: 'sourceKarriere', label: 'karriere.at' },
		{ name: 'sourceAms', label: 'AMS eJob-Room' }
	] as const;

	let cvBusy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function fmtSize(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.round(bytes / 1024)} KB`
			: `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function onCvSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		cvBusy = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/cv', { method: 'POST', body: fd });
			if (res.ok) {
				toast.success('Lebenslauf gespeichert');
				await invalidateAll();
			} else {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				toast.error(body.message ?? 'Upload fehlgeschlagen');
			}
		} finally {
			cvBusy = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function deleteCv() {
		cvBusy = true;
		try {
			const res = await fetch('/api/cv', { method: 'DELETE' });
			if (res.ok) {
				toast.success('Lebenslauf gelöscht');
				await invalidateAll();
			}
		} finally {
			cvBusy = false;
		}
	}
</script>

<form method="POST" use:enhance class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-2xl font-semibold">Einstellungen</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profil</Card.Title>
			<Card.Description>
				Diese Angaben nutzt die KI, um Stellen gegen dein Profil zu bewerten.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Form.Field {form} name="profileText">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Über dich</Form.Label>
						<Textarea
							{...props}
							bind:value={$formData.profileText}
							rows={5}
							placeholder="Erfahrung, Stärken, was du suchst …"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="roleKeywords">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Gesuchte Rollen (kommagetrennt)</Form.Label>
						<Input {...props} bind:value={$formData.roleKeywords} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="languages">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Sprachen mit Niveau (kommagetrennt)</Form.Label>
						<Input
							{...props}
							bind:value={$formData.languages}
							placeholder="Deutsch (A2), Englisch (B2) …"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="germanLevel">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Deutschniveau</Form.Label>
							<Input {...props} bind:value={$formData.germanLevel} placeholder="A2" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="experienceYears">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Erfahrung (Jahre)</Form.Label>
							<Input {...props} type="number" bind:value={$formData.experienceYears} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="availability">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Verfügbarkeit</Form.Label>
							<Input {...props} bind:value={$formData.availability} placeholder="Vollzeit, ab sofort" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<Form.Field {form} name="educationStatus">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Ausbildung / Status</Form.Label>
						<Input
							{...props}
							bind:value={$formData.educationStatus}
							placeholder="z.B. laufendes Studium, Matura"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="workPermit" class="flex flex-row items-center gap-2 space-y-0">
				<Form.Control>
					{#snippet children({ props })}
						<Checkbox {...props} bind:checked={$formData.workPermit} />
						<Form.Label class="font-normal">Arbeitsberechtigung für Österreich vorhanden</Form.Label>
					{/snippet}
				</Form.Control>
			</Form.Field>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Standort</Card.Title>
			<Card.Description>Für die Suche nach Betrieben in deiner Nähe.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 sm:grid-cols-3">
			<div class="sm:col-span-2">
				<Form.Field {form} name="homeAddress">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Adresse</Form.Label>
							<Input {...props} bind:value={$formData.homeAddress} placeholder="Straße Hausnr, PLZ Ort" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<Form.Field {form} name="radiusMeters">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Radius (m)</Form.Label>
						<Input {...props} type="number" bind:value={$formData.radiusMeters} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Portale</Card.Title>
			<Card.Description>Welche Jobportale durchsucht werden.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3 sm:grid-cols-2">
			{#each sources as src (src.name)}
				<Form.Field {form} name={src.name} class="flex flex-row items-center gap-2 space-y-0">
					<Form.Control>
						{#snippet children({ props })}
							<Checkbox {...props} bind:checked={$formData[src.name]} />
							<Form.Label class="font-normal">{src.label}</Form.Label>
						{/snippet}
					</Form.Control>
				</Form.Field>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>KI-Bewertung (OpenAI-kompatibel)</Card.Title>
			<Card.Description>
				Endpoint zum Bewerten der Stellen und Erstellen der Bewerbungs-Entwürfe.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Form.Field {form} name="llmBaseUrl">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Base URL</Form.Label>
						<Input {...props} bind:value={$formData.llmBaseUrl} placeholder="https://api.openai.com/v1" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="llmModel">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Modell</Form.Label>
						<Input {...props} bind:value={$formData.llmModel} placeholder="z.B. gpt-4o-mini" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="llmApiKey">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>API-Key</Form.Label>
						<Input
							{...props}
							type="password"
							bind:value={$formData.llmApiKey}
							placeholder={data.hasApiKey
								? '•••••••• (gespeichert — leer lassen zum Behalten)'
								: 'sk-…'}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field {form} name="rankingNotes">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Gewichtung fürs Ranking (optional)</Form.Label>
						<Textarea
							{...props}
							bind:value={$formData.rankingNotes}
							rows={3}
							placeholder="z.B. Stellen ohne Deutsch-Pflicht bevorzugen; kurze Anfahrt wichtig …"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
	</Card.Root>

	<Form.Button disabled={$submitting}>
		{#if $submitting}<Spinner class="size-4" />{:else}<Save class="size-4" />{/if}
		Speichern
	</Form.Button>
</form>

<!-- CV is handled outside the Superform via /api/cv -->
<div class="mx-auto mt-6 max-w-2xl">
	<Card.Root>
		<Card.Header>
			<Card.Title>Lebenslauf</Card.Title>
			<Card.Description>
				Wird für Initiativbewerbungen als Anhang verwendet. PDF oder Word, max. 10 MB.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.cv}
				<div class="flex items-center gap-3 rounded-md border p-3">
					<FileText class="text-muted-foreground size-8 shrink-0" />
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{data.cv.filename}</p>
						<p class="text-muted-foreground text-sm">
							{fmtSize(data.cv.size)} · hochgeladen
							{new Date(data.cv.uploadedAt).toLocaleDateString('de-AT')}
						</p>
					</div>
					<Button href="/api/cv" variant="outline" size="sm">
						<Download class="size-4" /> Download
					</Button>
					<Button variant="ghost" size="sm" disabled={cvBusy} onclick={deleteCv}>
						<Trash2 class="size-4" /> Löschen
					</Button>
				</div>
			{:else}
				<p class="text-muted-foreground text-sm">Noch kein Lebenslauf hinterlegt.</p>
			{/if}

			<input
				bind:this={fileInput}
				type="file"
				accept=".pdf,.doc,.docx,application/pdf"
				class="hidden"
				onchange={onCvSelected}
			/>
			<Button
				type="button"
				variant="secondary"
				disabled={cvBusy}
				onclick={() => fileInput?.click()}
			>
				{#if cvBusy}<Spinner class="size-4" />{:else}<Upload class="size-4" />{/if}
				{data.cv ? 'Ersetzen' : 'Hochladen'}
			</Button>
		</Card.Content>
	</Card.Root>
</div>
