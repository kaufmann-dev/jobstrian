<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import type { ProfileField, ProfilePreview } from '$lib/profile';
	import { settingsSchema } from './schema';
	import ProfileEditor from './profile-editor.svelte';
	import SearchConfigEditor from './search-config-editor.svelte';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type {
		GeneratedSearchConfigField,
		SearchConfig,
		SearchConfigField,
		SearchConfigPreview
	} from '$lib/search-config';

	let { data } = $props();
	const hasApiKey = $derived(data.hasApiKey);

	const form = superForm(
		untrack(() => data.form),
		{
			validators: zod4Client(settingsSchema),
			dataType: 'json',
			resetForm: false,
			invalidateAll: false,
			applyAction: false,
			multipleSubmits: 'abort',
			onChange: ({ paths }) => {
				if (!paths.includes('llmApiKey')) scheduleAutosave();
			},
			onSubmit: ({ submitter, validators }) => {
				if (submitter?.getAttribute('formaction') === '?/saveApiKey') {
					clearTimeout(autosaveTimer);
					validators(false);
				}
				saveStatus = 'saving';
			},
			onResult: ({ result, formElement }) => {
				const saved =
					result.type === 'success' && result.data && 'saved' in result.data
						? result.data.saved
						: undefined;
				saveStatus = result.type === 'success' ? 'saved' : 'error';
				if (saved === 'apiKey') {
					toast.success('API-Key gespeichert');
					const input = formElement.elements.namedItem('llmApiKey');
					if (input instanceof HTMLInputElement) input.value = '';
					void invalidateAll();
				}
			}
		}
	);
	const { form: formData, enhance, submitting, tainted, errors } = form;
	const enhanceAttachment = fromAction(enhance);
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	const sources = [
		{ name: 'sourceHokify', label: 'hokify' },
		{ name: 'sourceWillhaben', label: 'willhaben Jobs' },
		{ name: 'sourceKarriere', label: 'karriere.at' },
		{ name: 'sourceAms', label: 'AMS eJob-Room' }
	] as const;

	let cvBusy = $state(false);
	let importBusy = $state(false);
	let applyBusy = $state(false);
	let previewOpen = $state(false);
	let previewFields = $state<ProfileField[]>([]);
	let selectedFields = $state<ProfileField[]>([]);
	let preview = $state<Required<ProfilePreview>>({
		profileText: '',
		languages: [],
		germanLevel: '',
		experienceYears: null,
		educationStatus: '',
		availability: '',
		homeAddress: '',
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: []
	});
	let searchIntentOpen = $state(false);
	let searchIntent = $state('');
	let searchPreviewBusy = $state(false);
	let searchApplyBusy = $state(false);
	let searchPreviewOpen = $state(false);
	let searchPreviewFields = $state<SearchConfigField[]>([]);
	let selectedSearchFields = $state<SearchConfigField[]>([]);
	let searchPreview = $state<SearchConfig>({
		jobSearchKeywords: [],
		jobSearchLocations: [],
		businessOsmTags: [],
		businessRadiusMeters: 5000
	});

	const hasUnsavedChanges = $derived(Boolean($tainted));
	const canImport = $derived(Boolean(data.cv && data.hasLlmConfig && !hasUnsavedChanges));
	const canGenerateSearchConfig = $derived(Boolean(data.hasLlmConfig && !hasUnsavedChanges));

	function scheduleAutosave() {
		clearTimeout(autosaveTimer);
		saveStatus = 'idle';
		autosaveTimer = setTimeout(() => form.submit(), 700);
	}

	function fmtSize(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.round(bytes / 1024)} KB`
			: `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function responseMessage(response: Response, fallback: string): Promise<string> {
		const body = (await response.json().catch(() => ({}))) as { message?: string };
		return body.message ?? fallback;
	}

	async function onCvSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		cvBusy = true;
		try {
			const body = new FormData();
			body.append('file', file);
			const response = await fetch('/api/cv', { method: 'POST', body });
			if (!response.ok) throw new Error(await responseMessage(response, 'Upload fehlgeschlagen'));
			toast.success('Lebenslauf gespeichert');
			await invalidateAll();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Upload fehlgeschlagen');
		} finally {
			cvBusy = false;
			input.value = '';
		}
	}

	async function deleteCv() {
		cvBusy = true;
		try {
			const response = await fetch('/api/cv', { method: 'DELETE' });
			if (!response.ok) throw new Error(await responseMessage(response, 'Löschen fehlgeschlagen'));
			toast.success('Lebenslauf gelöscht');
			await invalidateAll();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Löschen fehlgeschlagen');
		} finally {
			cvBusy = false;
		}
	}

	async function createPreview() {
		if (!canImport) return;
		importBusy = true;
		try {
			const response = await fetch('/api/cv/profile-preview', { method: 'POST' });
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Lebenslauf konnte nicht ausgewertet werden')
				);
			}
			const body = (await response.json()) as { profile: ProfilePreview };
			previewFields = Object.keys(body.profile) as ProfileField[];
			selectedFields = [...previewFields];
			preview = { ...preview, ...body.profile };
			previewOpen = true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Lebenslauf konnte nicht ausgewertet werden'
			);
		} finally {
			importBusy = false;
		}
	}

	async function applyPreview() {
		applyBusy = true;
		try {
			const response = await fetch('/api/cv/profile', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ selected: selectedFields, profile: $state.snapshot(preview) })
			});
			if (!response.ok) {
				throw new Error(await responseMessage(response, 'Profil konnte nicht aktualisiert werden'));
			}
			previewOpen = false;
			await invalidateAll();
			form.reset({ data: data.form.data });
			toast.success('Profil aus Lebenslauf aktualisiert');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Profil konnte nicht aktualisiert werden'
			);
		} finally {
			applyBusy = false;
		}
	}

	function blankSearchPreview(): SearchConfig {
		return {
			jobSearchKeywords: [],
			jobSearchLocations: [],
			businessOsmTags: [],
			businessRadiusMeters: $formData.businessRadiusMeters
		};
	}

	async function createSearchPreview() {
		if (!canGenerateSearchConfig) return;
		searchPreviewBusy = true;
		try {
			const response = await fetch('/api/search-config/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ intent: searchIntent })
			});
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Suchkonfiguration konnte nicht erzeugt werden')
				);
			}
			const body = (await response.json()) as { searchConfig: SearchConfigPreview };
			searchPreviewFields = Object.keys(body.searchConfig) as SearchConfigField[];
			selectedSearchFields = [...searchPreviewFields];
			searchPreview = { ...blankSearchPreview(), ...body.searchConfig };
			searchIntentOpen = false;
			searchPreviewOpen = true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Suchkonfiguration konnte nicht erzeugt werden'
			);
		} finally {
			searchPreviewBusy = false;
		}
	}

	async function applySearchPreview() {
		searchApplyBusy = true;
		try {
			const selected = selectedSearchFields as GeneratedSearchConfigField[];
			const response = await fetch('/api/search-config', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					selected,
					searchConfig: $state.snapshot(searchPreview)
				})
			});
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Suchkonfiguration konnte nicht aktualisiert werden')
				);
			}
			searchPreviewOpen = false;
			await invalidateAll();
			form.reset({ data: data.form.data });
			toast.success('Suchkonfiguration aktualisiert');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Suchkonfiguration konnte nicht aktualisiert werden'
			);
		} finally {
			searchApplyBusy = false;
		}
	}
</script>

<form
	method="POST"
	action="?/autosave"
	{@attach enhanceAttachment}
	class="mx-auto max-w-3xl space-y-6"
>
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Einstellungen</h1>
			<p class="text-sm text-muted-foreground">Profil, Portale und KI-Konfiguration.</p>
		</div>
		<p class="pt-1 text-xs text-muted-foreground" aria-live="polite">
			{#if saveStatus === 'saving'}
				Wird gespeichert …
			{:else if saveStatus === 'saved'}
				Gespeichert
			{:else if saveStatus === 'error'}
				Speichern fehlgeschlagen
			{/if}
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profil</Card.Title>
			<Card.Description>
				Diese Angaben nutzt die KI, um Stellen und Betriebe gegen dein Profil zu bewerten.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			<ProfileEditor bind:profile={$formData} homeAddressErrors={$errors.homeAddress} />

			<div class="space-y-4 border-t pt-6">
				<div>
					<h3 class="text-sm font-medium">Lebenslauf</h3>
					<p class="text-sm text-muted-foreground">
						PDF, max. 10 MB. Wird als Anhang und auf Wunsch für den Profilimport verwendet.
					</p>
				</div>
				{#if data.cv}
					<div class="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
						<FileText class="size-8 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{data.cv.filename}</p>
							<p class="text-sm text-muted-foreground">
								{fmtSize(data.cv.size)} · hochgeladen
								{new Date(data.cv.uploadedAt).toLocaleDateString('de-AT')}
							</p>
						</div>
						<Button href="/api/cv" variant="outline" size="sm"><Download /> Download</Button>
						<Button variant="ghost" size="sm" disabled={cvBusy} onclick={deleteCv}>
							<Trash2 /> Löschen
						</Button>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Noch kein Lebenslauf hinterlegt.</p>
				{/if}

				<Input
					type="file"
					accept=".pdf,application/pdf"
					disabled={cvBusy}
					class="max-w-sm"
					onchange={onCvSelected}
				/>
				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={!canImport || importBusy}
						onclick={createPreview}
						title={hasUnsavedChanges ? 'Speichere zuerst die offenen Profiländerungen.' : undefined}
					>
						{#if importBusy}<Spinner />{:else}<Sparkles />{/if}
						Profil aus Lebenslauf aktualisieren
					</Button>
				</div>
				{#if data.cv && !data.hasLlmConfig}
					<p class="text-sm text-muted-foreground">
						Für den Profilimport müssen Base URL und Modell gespeichert sein.
					</p>
				{:else if hasUnsavedChanges}
					<p class="text-sm text-muted-foreground">
						Speichere die offenen Änderungen, bevor du das Profil importierst.
					</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Suchkonfiguration</Card.Title>
			<Card.Description>
				Keywords, Suchorte und Betriebskategorien für Portale und Initiativbewerbungen.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<SearchConfigEditor bind:config={$formData} />
			<div class="flex flex-wrap gap-2 border-t pt-4">
				<Button
					variant="outline"
					disabled={!canGenerateSearchConfig || searchPreviewBusy}
					onclick={() => (searchIntentOpen = true)}
					title={hasUnsavedChanges ? 'Speichere zuerst die offenen Änderungen.' : undefined}
				>
					{#if searchPreviewBusy}<Spinner />{:else}<Sparkles />{/if}
					Suchkonfiguration mit KI erstellen
				</Button>
			</div>
			{#if !data.hasLlmConfig}
				<p class="text-sm text-muted-foreground">
					Für die KI-Suchkonfiguration müssen Base URL und Modell gespeichert sein.
				</p>
			{:else if hasUnsavedChanges}
				<p class="text-sm text-muted-foreground">
					Speichere die offenen Änderungen, bevor du eine Suchkonfiguration erzeugst.
				</p>
			{/if}
			<div class="grid gap-2 sm:grid-cols-2">
				<Form.Field {form} name="jobSearchLocations">
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="businessRadiusMeters">
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="businessOsmTags">
					<Form.FieldErrors />
				</Form.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Portale</Card.Title>
			<Card.Description>Welche Jobportale durchsucht werden.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3 sm:grid-cols-2">
			{#each sources as source (source.name)}
				<Form.Field {form} name={source.name} class="flex flex-row items-center gap-2 space-y-0">
					<Form.Control>
						{#snippet children({ props })}
							<Checkbox {...props} bind:checked={$formData[source.name]} />
							<Form.Label class="font-normal">{source.label}</Form.Label>
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
				Endpoint zum Bewerten, für den Profilimport und für Bewerbungsentwürfe.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Form.Field {form} name="llmBaseUrl">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Base URL</Form.Label>
						<Input
							{...props}
							bind:value={$formData.llmBaseUrl}
							placeholder="https://api.openai.com/v1"
						/>
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
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="llmRequestsPerMinute">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Anfragen pro Minute</Form.Label>
							<Input
								{...props}
								type="number"
								min="1"
								max="10000"
								bind:value={$formData.llmRequestsPerMinute}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="llmMaxConcurrent">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Maximal gleichzeitig aktiv</Form.Label>
							<Input
								{...props}
								type="number"
								min="1"
								max="200"
								bind:value={$formData.llmMaxConcurrent}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<Form.Field {form} name="llmApiKey">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>API-Key</Form.Label>
						<Input
							{...props}
							type="password"
							bind:value={$formData.llmApiKey}
							placeholder={hasApiKey ? '•••••••• (gespeichert, leer lassen zum Behalten)' : 'sk-…'}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<div>
				<Button type="submit" formaction="?/saveApiKey" disabled={$submitting}>
					{#if $submitting}<Spinner />{:else}<Save />{/if}
					API-Key speichern
				</Button>
			</div>
			<Form.Field {form} name="rankingNotes">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Gewichtung fürs Ranking (optional)</Form.Label>
						<Textarea
							{...props}
							bind:value={$formData.rankingNotes}
							rows={3}
							placeholder="z.B. Stellen ohne Deutsch-Pflicht bevorzugen; kurze Anfahrt wichtig"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
	</Card.Root>
</form>

<Dialog.Root bind:open={previewOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Profil aus Lebenslauf aktualisieren</Dialog.Title>
			<Dialog.Description>
				Prüfe die erkannten Angaben. Nur ausgewählte Bereiche werden sofort gespeichert.
			</Dialog.Description>
		</Dialog.Header>
		<ProfileEditor bind:profile={preview} fields={previewFields} bind:selected={selectedFields} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (previewOpen = false)}>Abbrechen</Button>
			<Button disabled={applyBusy || selectedFields.length === 0} onclick={applyPreview}>
				{#if applyBusy}<Spinner />{:else}<Save />{/if}
				Auswahl übernehmen
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={searchIntentOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Suchkonfiguration mit KI erstellen</Dialog.Title>
			<Dialog.Description>
				Nenne Rolle, Branche, Seniorität, Arbeitszeit oder Ausschlüsse, die wichtig sind.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<label class="text-sm font-medium" for="search-config-intent">
				Welche Jobs möchtest du finden?
			</label>
			<Textarea
				id="search-config-intent"
				bind:value={searchIntent}
				rows={5}
				placeholder="z.B. Teilzeit im Verkauf oder Büro in Graz, keine Nachtschichten"
			/>
			<p class="text-sm text-muted-foreground">
				Beispiele können Rolle, Branche, Seniorität, Arbeitszeit und Ausschlüsse enthalten.
			</p>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (searchIntentOpen = false)}>Abbrechen</Button>
			<Button
				disabled={searchPreviewBusy || !searchIntent.trim() || !canGenerateSearchConfig}
				onclick={createSearchPreview}
			>
				{#if searchPreviewBusy}<Spinner />{:else}<Sparkles />{/if}
				Vorschlag erzeugen
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={searchPreviewOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Suchkonfiguration prüfen</Dialog.Title>
			<Dialog.Description>
				Prüfe die KI-Vorschläge. Nur ausgewählte Bereiche werden sofort gespeichert.
			</Dialog.Description>
		</Dialog.Header>
		<SearchConfigEditor
			bind:config={searchPreview}
			fields={searchPreviewFields}
			bind:selected={selectedSearchFields}
		/>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (searchPreviewOpen = false)}>Abbrechen</Button>
			<Button
				disabled={searchApplyBusy || selectedSearchFields.length === 0}
				onclick={applySearchPreview}
			>
				{#if searchApplyBusy}<Spinner />{:else}<Save />{/if}
				Auswahl übernehmen
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
