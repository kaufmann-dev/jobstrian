<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidate, invalidateAll, onNavigate } from '$app/navigation';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';
	import { toast } from 'svelte-sonner';
	import type { ProfileField, ProfilePreview } from '$lib/profile';
	import type { GeoSuggestion } from '$lib/geo';
	import { settingsSchema } from './schema';
	import {
		SettingsAutosaveQueue,
		type HomeLocationPatch,
		type SettingsPatchRequest,
		type SaveStatus
	} from './settings-autosave';
	import ProfileEditor from './profile-editor.svelte';
	import SearchConfigEditor from './search-config-editor.svelte';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type {
		GeneratedSearchConfigField,
		SearchConfig,
		SearchConfigField,
		SearchConfigPreview
	} from '$lib/search-config';

	let { data } = $props();
	let hasApiKey = $state(untrack(() => data.hasApiKey));
	let saveStatus = $state<SaveStatus>('idle');
	let autosaveDirty = $state(false);
	let homeLocationVerified = $state(untrack(() => data.homeLocationVerified));

	const autosave = new SettingsAutosaveQueue(
		async (patch) => {
			const response = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!response.ok)
				throw new Error(await responseMessage(response, 'Speichern fehlgeschlagen'));
			if (affectsSettingsStatus(patch)) await invalidate('app:settings-status');
		},
		(status) => {
			saveStatus = status;
			if (status === 'saved') autosaveDirty = false;
		}
	);

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
				const fields = new Set(paths.map((path) => path.split(/[.[\]]/, 1)[0]));
				for (const field of fields) {
					if (!field || field === 'llmApiKey' || field === 'homeAddress') continue;
					autosaveDirty = true;
					autosave.enqueueField(field, $formData[field as keyof typeof $formData]);
				}
			},
			onSubmit: ({ submitter, validators }) => {
				if (submitter?.getAttribute('formaction') === '?/saveApiKey') {
					validators(false);
				}
			},
			onResult: ({ result, formElement }) => {
				const resultData = result.type === 'success' ? result.data : undefined;
				const saved = resultData && 'saved' in resultData ? resultData.saved : undefined;
				if (saved === 'apiKey') {
					toast.success('API-Key gespeichert');
					hasApiKey = Boolean(resultData && 'hasApiKey' in resultData && resultData.hasApiKey);
					const input = formElement.elements.namedItem('llmApiKey');
					if (input instanceof HTMLInputElement) input.value = '';
				}
			}
		}
	);
	const { form: formData, enhance, submitting, errors } = form;
	const enhanceAttachment = fromAction(enhance);

	const sources = [
		{ name: 'sourceHokify', label: 'hokify' },
		{ name: 'sourceWillhaben', label: 'willhaben Jobs' },
		{ name: 'sourceKarriere', label: 'karriere.at' },
		{ name: 'sourceAms', label: 'AMS eJob-Room' }
	] as const;

	let cvInput = $state<HTMLInputElement | null>(null);
	let cvUploading = $state(false);
	let cvDeleting = $state(false);
	let importBusy = $state(false);
	let applyBusy = $state(false);
	let previewOpen = $state(false);
	let previewFields = $state<ProfileField[]>([]);
	let selectedFields = $state<ProfileField[]>([]);
	let preview = $state<Required<ProfilePreview>>({
		fullName: '',
		phone: '',
		email: '',
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

	const hasUnsavedChanges = $derived(
		autosaveDirty || saveStatus === 'saving' || saveStatus === 'error'
	);
	const canImport = $derived(Boolean(data.cv && data.hasLlmConfig && !hasUnsavedChanges));
	const canGenerateSearchConfig = $derived(Boolean(data.hasLlmConfig && !hasUnsavedChanges));

	onNavigate(() => autosave.flush());

	function affectsSettingsStatus(request: SettingsPatchRequest): boolean {
		if (request.homeLocation) return true;
		return Object.keys(request.patch).some((field) =>
			['llmBaseUrl', 'llmModel', 'jobSearchKeywords', 'businessOsmTags'].includes(field)
		);
	}

	function saveHomeAddress(value: string, suggestion?: GeoSuggestion) {
		autosaveDirty = true;
		homeLocationVerified = Boolean(suggestion?.verifiable);
		const homeLocation: HomeLocationPatch = suggestion?.verifiable
			? {
					address: suggestion.label,
					verified: true,
					provider: 'geoapify',
					id: suggestion.id,
					postcode: suggestion.postcode,
					city: suggestion.city,
					lat: suggestion.lat,
					lon: suggestion.lon
				}
			: { address: value, verified: false };
		autosave.enqueueHomeLocation(homeLocation);
		if (suggestion) void autosave.flush();
	}

	function commitHomeAddress(value: string) {
		saveHomeAddress(value);
		void autosave.flush();
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

	function fieldErrors(value: unknown): string[] {
		if (Array.isArray(value))
			return value.filter((error): error is string => typeof error === 'string');
		if (!value || typeof value !== 'object' || !('_errors' in value)) return [];
		const errors = value._errors;
		return Array.isArray(errors)
			? errors.filter((error): error is string => typeof error === 'string')
			: [];
	}

	function attachCvInput(input: HTMLInputElement) {
		cvInput = input;
		return () => {
			cvInput = null;
		};
	}

	async function onCvSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		cvUploading = true;
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
			cvUploading = false;
			input.value = '';
		}
	}

	async function deleteCv() {
		cvDeleting = true;
		try {
			const response = await fetch('/api/cv', { method: 'DELETE' });
			if (!response.ok) throw new Error(await responseMessage(response, 'Löschen fehlgeschlagen'));
			toast.success('Lebenslauf gelöscht');
			await invalidateAll();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Löschen fehlgeschlagen');
		} finally {
			cvDeleting = false;
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

<form method="POST" {@attach enhanceAttachment} class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Einstellungen</h1>
			<p class="text-sm text-muted-foreground">Profil, Portale und KI-Konfiguration.</p>
		</div>
		<p class="min-h-5 shrink-0 pt-1 text-right text-xs text-muted-foreground" aria-live="polite">
			{#if saveStatus === 'saving'}
				Wird gespeichert …
			{:else if saveStatus === 'saved'}
				Gespeichert
			{:else if saveStatus === 'error'}
				<button type="button" class="underline" onclick={() => autosave.retry()}>
					Speichern fehlgeschlagen · erneut versuchen
				</button>
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
			<ProfileEditor
				bind:profile={$formData}
				homeAddressErrors={$errors.homeAddress}
				homeAddressVerified={homeLocationVerified}
				onHomeAddressChange={saveHomeAddress}
				onHomeAddressCommit={commitHomeAddress}
				collapsibleHistory
			/>

			<div class="space-y-4 border-t pt-6">
				<div>
					<h3 class="text-sm font-medium">Lebenslauf</h3>
					<p class="text-sm text-muted-foreground">
						PDF, max. 10 MB. Wird als Anhang und auf Wunsch für den Profilimport verwendet.
					</p>
				</div>
				{#if data.cv}
					<div class="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<FileText class="size-8 shrink-0 text-muted-foreground" />
							<div class="min-w-0">
								<p class="truncate font-medium" title={data.cv.filename}>{data.cv.filename}</p>
								<p class="text-sm text-muted-foreground">
									{fmtSize(data.cv.size)} · hochgeladen
									{new Date(data.cv.uploadedAt).toLocaleDateString('de-AT')}
								</p>
							</div>
						</div>
						<div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
							<Button
								href="/api/cv"
								variant="outline"
								size="sm"
								class="w-full sm:w-auto"
								disabled={cvUploading || cvDeleting}
							>
								<Download /> Download
							</Button>
							<Button
								variant="destructive"
								size="sm"
								class="w-full sm:w-auto"
								disabled={cvUploading || cvDeleting}
								onclick={deleteCv}
							>
								{#if cvDeleting}<Spinner />{:else}<Trash2 />{/if}
								{cvDeleting ? 'Wird gelöscht …' : 'Löschen'}
							</Button>
						</div>
					</div>
					<Button
						variant="outline"
						class="w-full sm:w-auto"
						disabled={cvUploading || cvDeleting}
						onclick={() => cvInput?.click()}
					>
						{#if cvUploading}<Spinner />{:else}<Upload />{/if}
						{cvUploading ? 'PDF wird ersetzt …' : 'PDF ersetzen'}
					</Button>
				{:else}
					<div
						class="flex flex-col gap-3 rounded-2xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-center gap-3">
							<FileText class="size-8 shrink-0 text-muted-foreground" />
							<p class="text-sm text-muted-foreground">Noch kein Lebenslauf hinterlegt.</p>
						</div>
						<Button
							variant="outline"
							class="w-full sm:w-auto"
							disabled={cvUploading || cvDeleting}
							onclick={() => cvInput?.click()}
						>
							{#if cvUploading}<Spinner />{:else}<Upload />{/if}
							{cvUploading ? 'PDF wird hochgeladen …' : 'PDF hochladen'}
						</Button>
					</div>
				{/if}

				<input
					{@attach attachCvInput}
					type="file"
					accept=".pdf,application/pdf"
					aria-label="Lebenslauf als PDF auswählen"
					disabled={cvUploading || cvDeleting}
					class="sr-only"
					onchange={onCvSelected}
				/>
				{#if data.cv && !data.hasLlmConfig}
					<p class="text-sm text-muted-foreground">
						Für den Profilimport müssen Base URL und Modell gespeichert sein.
					</p>
				{/if}
			</div>
		</Card.Content>
		<Card.Footer class="border-t">
			<Button
				variant="outline"
				class="w-full sm:w-auto"
				disabled={!canImport || importBusy}
				onclick={createPreview}
				title={hasUnsavedChanges ? 'Speichere zuerst die offenen Profiländerungen.' : undefined}
			>
				{#if importBusy}<Spinner />{:else}<Sparkles />{/if}
				Profil aus Lebenslauf aktualisieren
			</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Suchkonfiguration</Card.Title>
			<Card.Description>
				Keywords, Suchorte und Betriebskategorien für Portale und Initiativbewerbungen.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<SearchConfigEditor
				bind:config={$formData}
				errors={{
					jobSearchLocations: fieldErrors($errors.jobSearchLocations),
					businessOsmTags: fieldErrors($errors.businessOsmTags),
					businessRadiusMeters: fieldErrors($errors.businessRadiusMeters)
				}}
			/>
			{#if !data.hasLlmConfig}
				<p class="text-sm text-muted-foreground">
					Für die KI-Suchkonfiguration müssen Base URL und Modell gespeichert sein.
				</p>
			{/if}
		</Card.Content>
		<Card.Footer class="border-t">
			<Button
				variant="outline"
				class="w-full sm:w-auto"
				disabled={!canGenerateSearchConfig || searchPreviewBusy}
				onclick={() => (searchIntentOpen = true)}
				title={hasUnsavedChanges ? 'Speichere zuerst die offenen Änderungen.' : undefined}
			>
				{#if searchPreviewBusy}<Spinner />{:else}<Sparkles />{/if}
				Suchkonfiguration mit KI erstellen
			</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Portale</Card.Title>
			<Card.Description>Welche Jobportale durchsucht werden.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3 sm:grid-cols-2">
			{#each sources as source (source.name)}
				<Form.Field
					{form}
					name={source.name}
					class="flex flex-row items-center justify-between gap-4 rounded-2xl border p-4"
				>
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label class="font-normal">{source.label}</Form.Label>
							<Switch {...props} bind:checked={$formData[source.name]} />
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
		<Card.Footer class="border-t">
			<Button
				type="submit"
				formaction="?/saveApiKey"
				class="w-full sm:w-auto"
				disabled={$submitting}
			>
				{#if $submitting}<Spinner />{:else}<Save />{/if}
				API-Key speichern
			</Button>
		</Card.Footer>
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
