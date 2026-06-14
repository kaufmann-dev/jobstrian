<script lang="ts">
	import type { ProfileField, ProfilePreview } from '$lib/profile';
	import type { GeoSuggestion } from '$lib/geo';
	import { untrack } from 'svelte';
	import RemoteAutocomplete from './remote-autocomplete.svelte';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type EditableProfile = Required<ProfilePreview>;
	let {
		profile = $bindable(),
		fields,
		selected = $bindable([]),
		homeAddressErrors = [],
		homeAddressVerified = false,
		onHomeAddressChange,
		collapsibleHistory = false
	}: {
		profile: EditableProfile;
		fields?: ProfileField[];
		selected?: ProfileField[];
		homeAddressErrors?: string[];
		homeAddressVerified?: boolean;
		onHomeAddressChange?: (value: string, suggestion?: GeoSuggestion) => void;
		collapsibleHistory?: boolean;
	} = $props();

	const allFields = Object.keys(profile) as ProfileField[];
	const visibleFields = $derived(fields ?? allFields);
	const selectable = $derived(Boolean(fields));
	let addressVerified = $state(untrack(() => homeAddressVerified));
	const addressError = $derived(homeAddressErrors[0]);

	function visible(field: ProfileField): boolean {
		return visibleFields.includes(field);
	}

	function selection(field: ProfileField, checked: boolean) {
		selected = checked
			? [...new Set([...selected, field])]
			: selected.filter((item) => item !== field);
	}

	function parseList(value: string): string[] {
		return value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function setField<Field extends keyof EditableProfile>(
		field: Field,
		value: EditableProfile[Field]
	) {
		profile = { ...profile, [field]: value };
	}

	function onHomeAddressInput(value: string) {
		addressVerified = false;
		setField('homeAddress', value);
		onHomeAddressChange?.(value);
	}

	function selectAddressSuggestion(suggestion: GeoSuggestion) {
		if (!suggestion.verifiable) return;
		addressVerified = true;
		setField('homeAddress', suggestion.label);
		onHomeAddressChange?.(suggestion.label, suggestion);
	}

	function updateEntry<
		ListField extends 'workExperience' | 'educationHistory' | 'certifications',
		Entry extends EditableProfile[ListField][number],
		EntryField extends keyof Entry
	>(listField: ListField, item: Entry, field: EntryField, value: Entry[EntryField]) {
		setField(
			listField,
			profile[listField].map((entry) =>
				entry === item ? { ...entry, [field]: value } : entry
			) as EditableProfile[ListField]
		);
	}

	function removeEntry<ListField extends 'workExperience' | 'educationHistory' | 'certifications'>(
		listField: ListField,
		item: EditableProfile[ListField][number]
	) {
		setField(
			listField,
			profile[listField].filter((entry) => entry !== item) as EditableProfile[ListField]
		);
	}

	function addWorkExperience() {
		setField('workExperience', [
			...profile.workExperience,
			{
				position: '',
				employer: '',
				location: '',
				startDate: '',
				endDate: '',
				description: ''
			}
		]);
	}

	function addEducation() {
		setField('educationHistory', [
			...profile.educationHistory,
			{
				qualification: '',
				institution: '',
				field: '',
				location: '',
				startDate: '',
				endDate: '',
				description: ''
			}
		]);
	}

	function addCertification() {
		setField('certifications', [
			...profile.certifications,
			{ name: '', issuer: '', date: '', description: '' }
		]);
	}
</script>

{#snippet heading(field: ProfileField, label: string)}
	<div class="flex items-center gap-2">
		{#if selectable}
			<Checkbox
				checked={selected.includes(field)}
				onCheckedChange={(checked) => selection(field, checked === true)}
				aria-label={`${label} übernehmen`}
			/>
		{/if}
		<h3 class="text-sm font-medium">{label}</h3>
	</div>
{/snippet}

{#snippet entryField(label: string, children: import('svelte').Snippet)}
	<Label class="flex w-full min-w-0 flex-col items-stretch gap-2">
		<span>{label}</span>
		{@render children()}
	</Label>
{/snippet}

{#snippet workExperienceEditor()}
	<div class="min-w-0 space-y-3">
		{#each profile.workExperience as item, index (index)}
			<div class="min-w-0 space-y-4 rounded-2xl border p-4">
				<div class="grid min-w-0 gap-4 sm:grid-cols-2">
					{@render entryField('Position', positionInput)}
					{#snippet positionInput()}
						<Input
							value={item.position}
							oninput={(event) =>
								updateEntry('workExperience', item, 'position', event.currentTarget.value)}
							placeholder="Position"
						/>
					{/snippet}
					{@render entryField('Arbeitgeber', employerInput)}
					{#snippet employerInput()}
						<Input
							value={item.employer}
							oninput={(event) =>
								updateEntry('workExperience', item, 'employer', event.currentTarget.value)}
							placeholder="Arbeitgeber"
						/>
					{/snippet}
					{@render entryField('Ort', locationInput)}
					{#snippet locationInput()}
						<Input
							value={item.location}
							oninput={(event) =>
								updateEntry('workExperience', item, 'location', event.currentTarget.value)}
							placeholder="Ort"
						/>
					{/snippet}
					<div class="grid min-w-0 grid-cols-2 gap-3">
						{@render entryField('Von', startInput)}
						{#snippet startInput()}
							<Input
								value={item.startDate}
								oninput={(event) =>
									updateEntry('workExperience', item, 'startDate', event.currentTarget.value)}
								placeholder="Von"
							/>
						{/snippet}
						{@render entryField('Bis', endInput)}
						{#snippet endInput()}
							<Input
								value={item.endDate}
								oninput={(event) =>
									updateEntry('workExperience', item, 'endDate', event.currentTarget.value)}
								placeholder="Bis"
							/>
						{/snippet}
					</div>
				</div>
				{@render entryField('Aufgaben und Erfolge', descriptionInput)}
				{#snippet descriptionInput()}
					<Textarea
						class="min-w-0"
						value={item.description}
						oninput={(event) =>
							updateEntry('workExperience', item, 'description', event.currentTarget.value)}
						rows={3}
						placeholder="Aufgaben und Erfolge"
					/>
				{/snippet}
				<div class="flex justify-end">
					<Button
						variant="destructive"
						size="sm"
						onclick={() => removeEntry('workExperience', item)}
					>
						<Trash2 /> Entfernen
					</Button>
				</div>
			</div>
		{/each}
		<Button variant="outline" size="sm" onclick={addWorkExperience}><Plus /> Station</Button>
	</div>
{/snippet}

{#snippet educationEditor()}
	<div class="min-w-0 space-y-3">
		{#each profile.educationHistory as item, index (index)}
			<div class="min-w-0 space-y-4 rounded-2xl border p-4">
				<div class="grid min-w-0 gap-4 sm:grid-cols-2">
					{@render entryField('Abschluss', qualificationInput)}
					{#snippet qualificationInput()}
						<Input
							value={item.qualification}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'qualification', event.currentTarget.value)}
							placeholder="Abschluss"
						/>
					{/snippet}
					{@render entryField('Institution', institutionInput)}
					{#snippet institutionInput()}
						<Input
							value={item.institution}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'institution', event.currentTarget.value)}
							placeholder="Institution"
						/>
					{/snippet}
					{@render entryField('Fachrichtung', fieldInput)}
					{#snippet fieldInput()}
						<Input
							value={item.field}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'field', event.currentTarget.value)}
							placeholder="Fachrichtung"
						/>
					{/snippet}
					{@render entryField('Ort', educationLocationInput)}
					{#snippet educationLocationInput()}
						<Input
							value={item.location}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'location', event.currentTarget.value)}
							placeholder="Ort"
						/>
					{/snippet}
					{@render entryField('Von', educationStartInput)}
					{#snippet educationStartInput()}
						<Input
							value={item.startDate}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'startDate', event.currentTarget.value)}
							placeholder="Von"
						/>
					{/snippet}
					{@render entryField('Bis', educationEndInput)}
					{#snippet educationEndInput()}
						<Input
							value={item.endDate}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'endDate', event.currentTarget.value)}
							placeholder="Bis"
						/>
					{/snippet}
				</div>
				{@render entryField('Details', educationDescriptionInput)}
				{#snippet educationDescriptionInput()}
					<Textarea
						class="min-w-0"
						value={item.description}
						oninput={(event) =>
							updateEntry('educationHistory', item, 'description', event.currentTarget.value)}
						rows={3}
						placeholder="Details"
					/>
				{/snippet}
				<div class="flex justify-end">
					<Button
						variant="destructive"
						size="sm"
						onclick={() => removeEntry('educationHistory', item)}
					>
						<Trash2 /> Entfernen
					</Button>
				</div>
			</div>
		{/each}
		<Button variant="outline" size="sm" onclick={addEducation}><Plus /> Ausbildung</Button>
	</div>
{/snippet}

{#snippet certificationsEditor()}
	<div class="min-w-0 space-y-3">
		{#each profile.certifications as item, index (index)}
			<div class="min-w-0 space-y-4 rounded-2xl border p-4">
				<div class="grid min-w-0 gap-4 sm:grid-cols-3">
					{@render entryField('Zertifikat', certificationNameInput)}
					{#snippet certificationNameInput()}
						<Input
							value={item.name}
							oninput={(event) =>
								updateEntry('certifications', item, 'name', event.currentTarget.value)}
							placeholder="Zertifikat"
						/>
					{/snippet}
					{@render entryField('Aussteller', issuerInput)}
					{#snippet issuerInput()}
						<Input
							value={item.issuer}
							oninput={(event) =>
								updateEntry('certifications', item, 'issuer', event.currentTarget.value)}
							placeholder="Aussteller"
						/>
					{/snippet}
					{@render entryField('Datum', certificationDateInput)}
					{#snippet certificationDateInput()}
						<Input
							value={item.date}
							oninput={(event) =>
								updateEntry('certifications', item, 'date', event.currentTarget.value)}
							placeholder="Datum"
						/>
					{/snippet}
				</div>
				{@render entryField('Details', certificationDescriptionInput)}
				{#snippet certificationDescriptionInput()}
					<Textarea
						class="min-w-0"
						value={item.description}
						oninput={(event) =>
							updateEntry('certifications', item, 'description', event.currentTarget.value)}
						rows={2}
						placeholder="Details"
					/>
				{/snippet}
				<div class="flex justify-end">
					<Button
						variant="destructive"
						size="sm"
						onclick={() => removeEntry('certifications', item)}
					>
						<Trash2 /> Entfernen
					</Button>
				</div>
			</div>
		{/each}
		<Button variant="outline" size="sm" onclick={addCertification}><Plus /> Zertifikat</Button>
	</div>
{/snippet}

<div class="min-w-0 space-y-5">
	{#if visible('fullName')}
		<div class="space-y-2">
			{@render heading('fullName', 'Name')}
			<Input
				value={profile.fullName}
				oninput={(event) => setField('fullName', event.currentTarget.value)}
				autocomplete="name"
				placeholder="Max Mustermann"
			/>
		</div>
	{/if}

	{#if visible('phone') || visible('email')}
		<div class="grid gap-4 sm:grid-cols-2">
			{#if visible('phone')}
				<div class="space-y-2">
					{@render heading('phone', 'Telefon')}
					<Input
						type="tel"
						value={profile.phone}
						oninput={(event) => setField('phone', event.currentTarget.value)}
						autocomplete="tel"
						placeholder="+43 660 1234567"
					/>
				</div>
			{/if}
			{#if visible('email')}
				<div class="space-y-2">
					{@render heading('email', 'E-Mail')}
					<Input
						type="email"
						value={profile.email}
						oninput={(event) => setField('email', event.currentTarget.value)}
						autocomplete="email"
						placeholder="max@example.com"
					/>
				</div>
			{/if}
		</div>
	{/if}

	{#if visible('profileText')}
		<div class="space-y-2">
			{@render heading('profileText', 'Über dich')}
			<Textarea
				value={profile.profileText}
				oninput={(event) => setField('profileText', event.currentTarget.value)}
				rows={5}
			/>
		</div>
	{/if}

	{#if visible('skills')}
		<div class="space-y-2">
			{@render heading('skills', 'Kenntnisse')}
			<Input
				value={profile.skills.join(', ')}
				onchange={(event) =>
					setField('skills', parseList((event.currentTarget as HTMLInputElement).value))}
				placeholder="Espressozubereitung, Kassensysteme"
			/>
		</div>
	{/if}

	{#if visible('languages')}
		<div class="space-y-2">
			{@render heading('languages', 'Sprachen mit Niveau')}
			<Input
				value={profile.languages.join(', ')}
				onchange={(event) =>
					setField('languages', parseList((event.currentTarget as HTMLInputElement).value))}
				placeholder="Deutsch (B1), Englisch (C1)"
			/>
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#if visible('germanLevel')}
			<div class="space-y-2">
				{@render heading('germanLevel', 'Deutschniveau')}
				<Input
					value={profile.germanLevel}
					oninput={(event) => setField('germanLevel', event.currentTarget.value)}
					placeholder="B1"
				/>
			</div>
		{/if}
		{#if visible('experienceYears')}
			<div class="space-y-2">
				{@render heading('experienceYears', 'Erfahrung (Jahre)')}
				<Input
					type="number"
					min="0"
					max="60"
					value={profile.experienceYears ?? undefined}
					oninput={(event) => {
						const value = event.currentTarget.valueAsNumber;
						setField('experienceYears', Number.isFinite(value) ? value : null);
					}}
				/>
			</div>
		{/if}
		{#if visible('availability')}
			<div class="space-y-2">
				{@render heading('availability', 'Verfügbarkeit')}
				<Input
					value={profile.availability}
					oninput={(event) => setField('availability', event.currentTarget.value)}
					placeholder="Vollzeit, ab sofort"
				/>
			</div>
		{/if}
	</div>

	{#if visible('educationStatus')}
		<div class="space-y-2">
			{@render heading('educationStatus', 'Ausbildung / Status')}
			<Input
				aria-label="Ausbildung / Status"
				value={profile.educationStatus}
				oninput={(event) => setField('educationStatus', event.currentTarget.value)}
			/>
		</div>
	{/if}

	{#if visible('homeAddress')}
		<div class="space-y-2">
			{@render heading('homeAddress', 'Adresse')}
			<RemoteAutocomplete
				kind="address"
				value={profile.homeAddress}
				onInput={onHomeAddressInput}
				onSelect={selectAddressSuggestion}
				label="Adresse"
				placeholder="Straße Hausnr, PLZ Ort"
			/>
			{#if profile.homeAddress.trim() && !addressVerified}
				<p class="text-sm text-muted-foreground">
					Wähle einen Adressvorschlag aus, um ortsabhängige Funktionen zu aktivieren.
				</p>
			{/if}
			{#if addressError}
				<p class="text-sm font-medium text-destructive">{addressError}</p>
			{/if}
		</div>
	{/if}

	{#if collapsibleHistory}
		<Accordion.Root type="multiple">
			{#if visible('workExperience')}
				<Accordion.Item value="work-experience" class="data-open:bg-transparent">
					<Accordion.Trigger
						class="items-center gap-4 hover:no-underline [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1"
					>
						<span class="truncate">Berufserfahrung</span>
						<span
							class="w-8 shrink-0 text-center text-xs font-normal text-muted-foreground tabular-nums"
						>
							{profile.workExperience.length}
						</span>
					</Accordion.Trigger>
					<Accordion.Content>{@render workExperienceEditor()}</Accordion.Content>
				</Accordion.Item>
			{/if}
			{#if visible('educationHistory')}
				<Accordion.Item value="education-history" class="data-open:bg-transparent">
					<Accordion.Trigger
						class="items-center gap-4 hover:no-underline [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1"
					>
						<span class="truncate">Ausbildungsverlauf</span>
						<span
							class="w-8 shrink-0 text-center text-xs font-normal text-muted-foreground tabular-nums"
						>
							{profile.educationHistory.length}
						</span>
					</Accordion.Trigger>
					<Accordion.Content>{@render educationEditor()}</Accordion.Content>
				</Accordion.Item>
			{/if}
			{#if visible('certifications')}
				<Accordion.Item value="certifications" class="data-open:bg-transparent">
					<Accordion.Trigger
						class="items-center gap-4 hover:no-underline [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1"
					>
						<span class="truncate">Zertifikate</span>
						<span
							class="w-8 shrink-0 text-center text-xs font-normal text-muted-foreground tabular-nums"
						>
							{profile.certifications.length}
						</span>
					</Accordion.Trigger>
					<Accordion.Content>{@render certificationsEditor()}</Accordion.Content>
				</Accordion.Item>
			{/if}
		</Accordion.Root>
	{:else}
		{#if visible('workExperience')}
			<section class="space-y-3">
				{@render heading('workExperience', 'Berufserfahrung')}
				{@render workExperienceEditor()}
			</section>
		{/if}
		{#if visible('educationHistory')}
			<section class="space-y-3">
				{@render heading('educationHistory', 'Ausbildungsverlauf')}
				{@render educationEditor()}
			</section>
		{/if}
		{#if visible('certifications')}
			<section class="space-y-3">
				{@render heading('certifications', 'Zertifikate')}
				{@render certificationsEditor()}
			</section>
		{/if}
	{/if}
</div>
