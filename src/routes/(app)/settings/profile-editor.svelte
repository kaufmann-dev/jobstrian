<script lang="ts">
	import type { ProfileField, ProfilePreview } from '$lib/profile';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type EditableProfile = Required<ProfilePreview>;

	let {
		profile = $bindable(),
		fields,
		selected = $bindable([])
	}: {
		profile: EditableProfile;
		fields?: ProfileField[];
		selected?: ProfileField[];
	} = $props();

	const allFields = Object.keys(profile) as ProfileField[];
	const visibleFields = $derived(fields ?? allFields);
	const selectable = $derived(Boolean(fields));

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

<div class="space-y-5">
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
			<Input
				value={profile.homeAddress}
				oninput={(event) => setField('homeAddress', event.currentTarget.value)}
				placeholder="Straße Hausnr, PLZ Ort"
			/>
		</div>
	{/if}

	{#if visible('workExperience')}
		<section class="space-y-3">
			{@render heading('workExperience', 'Berufserfahrung')}
			{#each profile.workExperience as item (item)}
				<div class="space-y-3 rounded-2xl border p-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<Input
							value={item.position}
							oninput={(event) =>
								updateEntry('workExperience', item, 'position', event.currentTarget.value)}
							placeholder="Position"
						/>
						<Input
							value={item.employer}
							oninput={(event) =>
								updateEntry('workExperience', item, 'employer', event.currentTarget.value)}
							placeholder="Arbeitgeber"
						/>
						<Input
							value={item.location}
							oninput={(event) =>
								updateEntry('workExperience', item, 'location', event.currentTarget.value)}
							placeholder="Ort"
						/>
						<div class="grid grid-cols-2 gap-3">
							<Input
								value={item.startDate}
								oninput={(event) =>
									updateEntry('workExperience', item, 'startDate', event.currentTarget.value)}
								placeholder="Von"
							/>
							<Input
								value={item.endDate}
								oninput={(event) =>
									updateEntry('workExperience', item, 'endDate', event.currentTarget.value)}
								placeholder="Bis"
							/>
						</div>
					</div>
					<Textarea
						value={item.description}
						oninput={(event) =>
							updateEntry('workExperience', item, 'description', event.currentTarget.value)}
						rows={3}
						placeholder="Aufgaben und Erfolge"
					/>
					<Button variant="ghost" size="sm" onclick={() => removeEntry('workExperience', item)}>
						<Trash2 /> Entfernen
					</Button>
				</div>
			{/each}
			<Button variant="outline" size="sm" onclick={addWorkExperience}><Plus /> Station</Button>
		</section>
	{/if}

	{#if visible('educationHistory')}
		<section class="space-y-3">
			{@render heading('educationHistory', 'Ausbildungsverlauf')}
			{#each profile.educationHistory as item (item)}
				<div class="space-y-3 rounded-2xl border p-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<Input
							value={item.qualification}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'qualification', event.currentTarget.value)}
							placeholder="Abschluss"
						/>
						<Input
							value={item.institution}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'institution', event.currentTarget.value)}
							placeholder="Institution"
						/>
						<Input
							value={item.field}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'field', event.currentTarget.value)}
							placeholder="Fachrichtung"
						/>
						<Input
							value={item.location}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'location', event.currentTarget.value)}
							placeholder="Ort"
						/>
						<Input
							value={item.startDate}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'startDate', event.currentTarget.value)}
							placeholder="Von"
						/>
						<Input
							value={item.endDate}
							oninput={(event) =>
								updateEntry('educationHistory', item, 'endDate', event.currentTarget.value)}
							placeholder="Bis"
						/>
					</div>
					<Textarea
						value={item.description}
						oninput={(event) =>
							updateEntry('educationHistory', item, 'description', event.currentTarget.value)}
						rows={3}
						placeholder="Details"
					/>
					<Button variant="ghost" size="sm" onclick={() => removeEntry('educationHistory', item)}>
						<Trash2 /> Entfernen
					</Button>
				</div>
			{/each}
			<Button variant="outline" size="sm" onclick={addEducation}><Plus /> Ausbildung</Button>
		</section>
	{/if}

	{#if visible('certifications')}
		<section class="space-y-3">
			{@render heading('certifications', 'Zertifikate')}
			{#each profile.certifications as item (item)}
				<div class="space-y-3 rounded-2xl border p-4">
					<div class="grid gap-3 sm:grid-cols-3">
						<Input
							value={item.name}
							oninput={(event) =>
								updateEntry('certifications', item, 'name', event.currentTarget.value)}
							placeholder="Zertifikat"
						/>
						<Input
							value={item.issuer}
							oninput={(event) =>
								updateEntry('certifications', item, 'issuer', event.currentTarget.value)}
							placeholder="Aussteller"
						/>
						<Input
							value={item.date}
							oninput={(event) =>
								updateEntry('certifications', item, 'date', event.currentTarget.value)}
							placeholder="Datum"
						/>
					</div>
					<Textarea
						value={item.description}
						oninput={(event) =>
							updateEntry('certifications', item, 'description', event.currentTarget.value)}
						rows={2}
						placeholder="Details"
					/>
					<Button variant="ghost" size="sm" onclick={() => removeEntry('certifications', item)}>
						<Trash2 /> Entfernen
					</Button>
				</div>
			{/each}
			<Button variant="outline" size="sm" onclick={addCertification}><Plus /> Zertifikat</Button>
		</section>
	{/if}
</div>
