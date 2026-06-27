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
	import RankingCriteriaEditor from './ranking-criteria-editor.svelte';
	import SearchConfigEditor from './search-config-editor.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Save from '@lucide/svelte/icons/save';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import type {
		GeneratedSearchConfigField,
		SearchConfig,
		SearchConfigField,
		SearchConfigPreview
	} from '$lib/search-config';
	import {
		DEFAULT_LEAD_RANKING_CRITERIA,
		DEFAULT_LISTING_RANKING_CRITERIA,
		type GeneratedRankingCriteriaField,
		type RankingCriteriaAiPreview
	} from '$lib/ranking-criteria';

	let { data } = $props();
	let hasApiKey = $state(untrack(() => data.hasApiKey));
	let emailDomain = $state.raw(untrack(() => data.applicationEmailDomain));
	let saveStatus = $state<SaveStatus>('idle');
	let autosaveDirty = $state(false);
	let homeLocationVerified = $state(untrack(() => data.homeLocationVerified));
	let emailDomainBusy = $state(false);
	let testEmailBusy = $state(false);

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
					if (
						!field ||
						field === 'llmApiKey' ||
						field === 'homeAddress' ||
						field.startsWith('resend')
					)
						continue;
					autosaveDirty = true;
					autosave.enqueueField(field, $formData[field as keyof typeof $formData]);
				}
			},
			onSubmit: ({ submitter, validators }) => {
				const action = submitter?.getAttribute('formaction');
				if (action === '?/saveApiKey' || action === '?/saveResendSettings') {
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
				} else if (saved === 'resendSettings') {
					toast.success('E-Mail-Einstellungen gespeichert');
					if (
						resultData &&
						'applicationEmailDomain' in resultData &&
						resultData.applicationEmailDomain
					) {
						emailDomain = resultData.applicationEmailDomain;
					}
					const apiKey = formElement.elements.namedItem('resendApiKey');
					if (apiKey instanceof HTMLInputElement) apiKey.value = '';
					const secret = formElement.elements.namedItem('resendWebhookSecret');
					if (secret instanceof HTMLInputElement) secret.value = '';
					$formData.resendApiKey = '';
					$formData.resendWebhookSecret = '';
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
	let rankingCriteriaIntentOpen = $state(false);
	let rankingCriteriaIntent = $state('');
	let rankingCriteriaPreviewBusy = $state(false);
	let rankingCriteriaApplyBusy = $state(false);
	let rankingCriteriaPreviewOpen = $state(false);
	let rankingCriteriaPreviewFields = $state<GeneratedRankingCriteriaField[]>([]);
	let selectedRankingCriteriaFields = $state<GeneratedRankingCriteriaField[]>([]);
	let rankingCriteriaPreview = $state<RankingCriteriaAiPreview>({
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA
	});

	const hasUnsavedChanges = $derived(
		autosaveDirty || saveStatus === 'saving' || saveStatus === 'error'
	);
	const canImport = $derived(Boolean(data.cv && data.hasLlmConfig && !hasUnsavedChanges));
	const canGenerateSearchConfig = $derived(Boolean(data.hasLlmConfig && !hasUnsavedChanges));
	const canGenerateRankingCriteria = $derived(Boolean(data.hasLlmConfig && !hasUnsavedChanges));

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

	async function copy(text: string, what: string): Promise<void> {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} kopiert`);
	}

	async function syncEmailDomain() {
		emailDomainBusy = true;
		try {
			const response = await fetch('/api/application-emails/domain', { method: 'POST' });
			const body = (await response.json().catch(() => ({}))) as {
				config?: typeof emailDomain;
				message?: string;
			};
			if (!response.ok)
				throw new Error(body.message ?? 'DNS-Einträge konnten nicht geladen werden');
			if (body.config) emailDomain = body.config;
			toast.success('Resend-Status aktualisiert');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'DNS-Einträge konnten nicht geladen werden'
			);
		} finally {
			emailDomainBusy = false;
		}
	}

	async function sendTestEmail() {
		testEmailBusy = true;
		try {
			const response = await fetch('/api/application-emails/test', { method: 'POST' });
			const body = (await response.json().catch(() => ({}))) as {
				recipient?: string;
				message?: string;
			};
			if (!response.ok) throw new Error(body.message ?? 'Test-E-Mail konnte nicht gesendet werden');
			toast.success(
				body.recipient ? `Test-E-Mail an ${body.recipient} gesendet` : 'Test-E-Mail gesendet'
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Test-E-Mail konnte nicht gesendet werden'
			);
		} finally {
			testEmailBusy = false;
		}
	}

	function dnsStatusLabel(status: string): string {
		if (status === 'verified') return 'verifiziert';
		if (status === 'pending') return 'wartet';
		if (status === 'temporary_failure') return 'temporärer Fehler';
		return status || 'offen';
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

	async function createRankingCriteriaPreview() {
		if (!canGenerateRankingCriteria) return;
		rankingCriteriaPreviewBusy = true;
		try {
			const response = await fetch('/api/ranking-criteria/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ intent: rankingCriteriaIntent })
			});
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Bewertungskriterien konnten nicht erzeugt werden')
				);
			}
			const body = (await response.json()) as { rankingCriteria: RankingCriteriaAiPreview };
			rankingCriteriaPreviewFields = Object.keys(
				body.rankingCriteria
			) as GeneratedRankingCriteriaField[];
			selectedRankingCriteriaFields = [...rankingCriteriaPreviewFields];
			rankingCriteriaPreview = body.rankingCriteria;
			rankingCriteriaIntentOpen = false;
			rankingCriteriaPreviewOpen = true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Bewertungskriterien konnten nicht erzeugt werden'
			);
		} finally {
			rankingCriteriaPreviewBusy = false;
		}
	}

	async function applyRankingCriteriaPreview() {
		rankingCriteriaApplyBusy = true;
		try {
			const response = await fetch('/api/ranking-criteria', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					selected: selectedRankingCriteriaFields,
					rankingCriteria: $state.snapshot(rankingCriteriaPreview)
				})
			});
			if (!response.ok) {
				throw new Error(
					await responseMessage(response, 'Bewertungskriterien konnten nicht aktualisiert werden')
				);
			}
			rankingCriteriaPreviewOpen = false;
			await invalidateAll();
			form.reset({ data: data.form.data });
			toast.success('Bewertungskriterien aktualisiert');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Bewertungskriterien konnten nicht aktualisiert werden'
			);
		} finally {
			rankingCriteriaApplyBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Einstellungen · Jobstrian</title>
	<meta
		name="description"
		content="Profil, Bewertungskriterien und Sucheinstellungen für deine Stellensuche anpassen."
	/>
</svelte:head>

<form method="POST" {@attach enhanceAttachment} class="mx-auto max-w-3xl space-y-6">
	<PageHeader title="Einstellungen" description="Profil, Portale und KI-Konfiguration.">
		{#snippet status()}
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
		{/snippet}
	</PageHeader>

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
				Suchkonfiguration erstellen
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
			<Card.Title>KI-Anbindung (OpenAI-kompatibel)</Card.Title>
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

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<Card.Title>E-Mail-Versand</Card.Title>
					<Card.Description>
						Resend-Domain und Statusabgleich für automatische Initiativbewerbungen.
					</Card.Description>
				</div>
				<Badge variant={emailDomain.enabled ? 'default' : 'secondary'} class="w-fit">
					{#if emailDomain.enabled}<Check class="size-3" /> aktiviert{:else}nicht aktiviert{/if}
				</Badge>
			</div>
		</Card.Header>
		<Card.Content class="space-y-5">
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="resendDomain">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Versanddomain</Form.Label>
							<Input {...props} bind:value={$formData.resendDomain} placeholder="example.com" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="resendFromLocalPart">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Absender</Form.Label>
							<div class="flex items-center gap-2">
								<Input
									{...props}
									bind:value={$formData.resendFromLocalPart}
									placeholder="bewerbung"
								/>
								<span class="text-sm text-muted-foreground"
									>@{$formData.resendDomain || 'domain'}</span
								>
							</div>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="resendFromName">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Absendername</Form.Label>
							<Input
								{...props}
								bind:value={$formData.resendFromName}
								placeholder={$formData.fullName}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="resendReplyTo">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Antwortadresse</Form.Label>
							<Input
								{...props}
								type="email"
								bind:value={$formData.resendReplyTo}
								placeholder={$formData.email}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="resendApiKey">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Resend API-Key</Form.Label>
							<Input
								{...props}
								type="password"
								bind:value={$formData.resendApiKey}
								placeholder={emailDomain.hasResendApiKey
									? '•••••••• (gespeichert, leer lassen zum Behalten)'
									: 're_…'}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Field {form} name="resendWebhookSecret">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Webhook Secret</Form.Label>
							<Input
								{...props}
								type="password"
								bind:value={$formData.resendWebhookSecret}
								placeholder={emailDomain.webhookConfigured
									? '•••••••• (gespeichert, leer lassen zum Behalten)'
									: 'whsec_…'}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>
			<div class="rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Typ</Table.Head>
							<Table.Head>Name</Table.Head>
							<Table.Head>Wert</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if emailDomain.records.length}
							{#each emailDomain.records as record (`${record.type}-${record.name}-${record.value}`)}
								<Table.Row>
									<Table.Cell class="font-medium">{record.type}</Table.Cell>
									<Table.Cell class="max-w-36 truncate" title={record.name}
										>{record.name}</Table.Cell
									>
									<Table.Cell class="max-w-64 truncate font-mono text-xs" title={record.value}>
										{record.value}
									</Table.Cell>
									<Table.Cell>
										<Badge variant={record.status === 'verified' ? 'default' : 'secondary'}>
											{dnsStatusLabel(record.status)}
										</Badge>
									</Table.Cell>
									<Table.Cell>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="DNS-Wert kopieren"
											onclick={() => copy(record.value, 'DNS-Wert')}
										>
											<Copy class="size-4" />
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						{:else}
							<Table.Row>
								<Table.Cell colspan={5} class="text-sm text-muted-foreground">
									Speichere die E-Mail-Einstellungen und prüfe danach den Resend-Status.
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</div>
			<p class="text-sm text-muted-foreground">
				Aktueller Status: {dnsStatusLabel(emailDomain.status)}{emailDomain.verifiedAt
					? ` · geprüft am ${new Date(emailDomain.verifiedAt).toLocaleString('de-AT')}`
					: ''}
			</p>
		</Card.Content>
		<Card.Footer class="flex flex-col gap-2 border-t sm:flex-row">
			<Button
				type="submit"
				formaction="?/saveResendSettings"
				class="w-full sm:w-auto"
				disabled={$submitting}
			>
				{#if $submitting}<Spinner />{:else}<Save />{/if}
				Einstellungen speichern
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full sm:w-auto"
				disabled={emailDomainBusy || !emailDomain.hasResendApiKey}
				onclick={syncEmailDomain}
			>
				{#if emailDomainBusy}<Spinner />{:else}<RefreshCw />{/if}
				Resend-Status prüfen
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full sm:w-auto"
				disabled={testEmailBusy || !emailDomain.hasResendApiKey}
				onclick={sendTestEmail}
			>
				{#if testEmailBusy}<Spinner />{:else}<MailCheck />{/if}
				Test-E-Mail senden
			</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Bewertungskriterien</Card.Title>
			<Card.Description>
				Die KI vergibt pro Kriterium 0 bis 5 Punkte; die App berechnet daraus den Score.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<RankingCriteriaEditor
				bind:criteria={$formData}
				errors={{
					listingRankingCriteria: fieldErrors($errors.listingRankingCriteria),
					leadRankingCriteria: fieldErrors($errors.leadRankingCriteria)
				}}
			/>
			{#if !data.hasLlmConfig}
				<p class="text-sm text-muted-foreground">
					Für KI-generierte Bewertungskriterien müssen Base URL und Modell gespeichert sein.
				</p>
			{/if}
		</Card.Content>
		<Card.Footer class="border-t">
			<Button
				variant="outline"
				class="w-full sm:w-auto"
				disabled={!canGenerateRankingCriteria || rankingCriteriaPreviewBusy}
				onclick={() => (rankingCriteriaIntentOpen = true)}
				title={hasUnsavedChanges ? 'Speichere zuerst die offenen Änderungen.' : undefined}
			>
				{#if rankingCriteriaPreviewBusy}<Spinner />{:else}<Sparkles />{/if}
				Bewertungskriterien erstellen
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
				Beschreibe, welche Jobs oder Betriebe gefunden werden sollen. Daraus werden Keywords,
				Suchorte, Betriebskategorien und Entfernung vorgeschlagen.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<label class="text-sm font-medium" for="search-config-intent">
				Welche Stellen und Betriebe sollen gefunden werden?
			</label>
			<Textarea
				id="search-config-intent"
				bind:value={searchIntent}
				rows={5}
				placeholder="z.B. Jobs in Wien im Verkauf, Kundenservice oder in der Büroassistenz"
			/>
			<p class="text-sm text-muted-foreground">
				Wird für Portal-Suchen und Initiativbewerbungen verwendet. Es geht darum, möglichst passende
				Treffer zu finden.
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

<Dialog.Root bind:open={rankingCriteriaIntentOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Bewertungskriterien aus Beschreibung erstellen</Dialog.Title>
			<Dialog.Description>
				Beschreibe, nach welchen Kriterien die Treffer bewertet werden sollen. Daraus werden
				Bewertungskriterien und Gewichtungen vorgeschlagen.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-2">
			<label class="text-sm font-medium" for="ranking-criteria-intent">
				Wonach sollen Treffer bewertet werden?
			</label>
			<Textarea
				id="ranking-criteria-intent"
				bind:value={rankingCriteriaIntent}
				rows={5}
				placeholder="z.B. Pflichtanforderungen erfüllt, Teilzeit bevorzugt, Deutsch B1 reicht"
			/>
			<p class="text-sm text-muted-foreground">
				Wird für den Score verwendet. Es geht darum, gefundene Stellen und Betriebe richtig zu
				bewerten.
			</p>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (rankingCriteriaIntentOpen = false)}>
				Abbrechen
			</Button>
			<Button
				disabled={rankingCriteriaPreviewBusy ||
					!rankingCriteriaIntent.trim() ||
					!canGenerateRankingCriteria}
				onclick={createRankingCriteriaPreview}
			>
				{#if rankingCriteriaPreviewBusy}<Spinner />{:else}<Sparkles />{/if}
				Vorschlag erzeugen
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={rankingCriteriaPreviewOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>Bewertungskriterien prüfen</Dialog.Title>
			<Dialog.Description>
				Prüfe die KI-Vorschläge. Nur ausgewählte Kriterienlisten werden sofort gespeichert.
			</Dialog.Description>
		</Dialog.Header>
		<RankingCriteriaEditor
			bind:criteria={rankingCriteriaPreview}
			fields={rankingCriteriaPreviewFields}
			bind:selected={selectedRankingCriteriaFields}
		/>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (rankingCriteriaPreviewOpen = false)}>
				Abbrechen
			</Button>
			<Button
				disabled={rankingCriteriaApplyBusy || selectedRankingCriteriaFields.length === 0}
				onclick={applyRankingCriteriaPreview}
			>
				{#if rankingCriteriaApplyBusy}<Spinner />{:else}<Save />{/if}
				Auswahl übernehmen
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
