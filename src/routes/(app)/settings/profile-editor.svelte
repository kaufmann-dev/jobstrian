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

	function addWorkExperience() {
		profile.workExperience.push({
			position: '',
			employer: '',
			location: '',
			startDate: '',
			endDate: '',
			description: ''
		});
	}

	function addEducation() {
		profile.educationHistory.push({
			qualification: '',
			institution: '',
			field: '',
			location: '',
			startDate: '',
			endDate: '',
			description: ''
		});
	}

	function addCertification() {
		profile.certifications.push({ name: '', issuer: '', date: '', description: '' });
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
			<Textarea bind:value={profile.profileText} rows={5} />
		</div>
	{/if}

	{#if visible('roleKeywords')}
		<div class="space-y-2">
			{@render heading('roleKeywords', 'Gesuchte Rollen')}
			<Input
				value={profile.roleKeywords.join(', ')}
				onchange={(event) =>
					(profile.roleKeywords = parseList((event.currentTarget as HTMLInputElement).value))}
				placeholder="Barista, Servicekraft"
			/>
		</div>
	{/if}

	{#if visible('skills')}
		<div class="space-y-2">
			{@render heading('skills', 'Kenntnisse')}
			<Input
				value={profile.skills.join(', ')}
				onchange={(event) =>
					(profile.skills = parseList((event.currentTarget as HTMLInputElement).value))}
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
					(profile.languages = parseList((event.currentTarget as HTMLInputElement).value))}
				placeholder="Deutsch (B1), Englisch (C1)"
			/>
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#if visible('germanLevel')}
			<div class="space-y-2">
				{@render heading('germanLevel', 'Deutschniveau')}
				<Input bind:value={profile.germanLevel} placeholder="B1" />
			</div>
		{/if}
		{#if visible('experienceYears')}
			<div class="space-y-2">
				{@render heading('experienceYears', 'Erfahrung (Jahre)')}
				<Input type="number" min="0" max="60" bind:value={profile.experienceYears} />
			</div>
		{/if}
		{#if visible('availability')}
			<div class="space-y-2">
				{@render heading('availability', 'Verfügbarkeit')}
				<Input bind:value={profile.availability} placeholder="Vollzeit, ab sofort" />
			</div>
		{/if}
	</div>

	{#if visible('educationStatus')}
		<div class="space-y-2">
			{@render heading('educationStatus', 'Ausbildung / Status')}
			<Input bind:value={profile.educationStatus} />
		</div>
	{/if}

	{#if visible('workPermit')}
		<div class="space-y-2">
			{@render heading('workPermit', 'Arbeitsberechtigung')}
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={profile.workPermit} />
				Arbeitsberechtigung für Österreich vorhanden
			</label>
		</div>
	{/if}

	{#if visible('homeAddress')}
		<div class="space-y-2">
			{@render heading('homeAddress', 'Adresse')}
			<Input bind:value={profile.homeAddress} placeholder="Straße Hausnr, PLZ Ort" />
		</div>
	{/if}

	{#if visible('workExperience')}
		<section class="space-y-3">
			{@render heading('workExperience', 'Berufserfahrung')}
			{#each profile.workExperience as item (item)}
				<div class="space-y-3 rounded-2xl border p-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<Input bind:value={item.position} placeholder="Position" />
						<Input bind:value={item.employer} placeholder="Arbeitgeber" />
						<Input bind:value={item.location} placeholder="Ort" />
						<div class="grid grid-cols-2 gap-3">
							<Input bind:value={item.startDate} placeholder="Von" />
							<Input bind:value={item.endDate} placeholder="Bis" />
						</div>
					</div>
					<Textarea bind:value={item.description} rows={3} placeholder="Aufgaben und Erfolge" />
					<Button
						variant="ghost"
						size="sm"
						onclick={() =>
							(profile.workExperience = profile.workExperience.filter((entry) => entry !== item))}
					>
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
						<Input bind:value={item.qualification} placeholder="Abschluss" />
						<Input bind:value={item.institution} placeholder="Institution" />
						<Input bind:value={item.field} placeholder="Fachrichtung" />
						<Input bind:value={item.location} placeholder="Ort" />
						<Input bind:value={item.startDate} placeholder="Von" />
						<Input bind:value={item.endDate} placeholder="Bis" />
					</div>
					<Textarea bind:value={item.description} rows={3} placeholder="Details" />
					<Button
						variant="ghost"
						size="sm"
						onclick={() =>
							(profile.educationHistory = profile.educationHistory.filter(
								(entry) => entry !== item
							))}
					>
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
						<Input bind:value={item.name} placeholder="Zertifikat" />
						<Input bind:value={item.issuer} placeholder="Aussteller" />
						<Input bind:value={item.date} placeholder="Datum" />
					</div>
					<Textarea bind:value={item.description} rows={2} placeholder="Details" />
					<Button
						variant="ghost"
						size="sm"
						onclick={() =>
							(profile.certifications = profile.certifications.filter((entry) => entry !== item))}
					>
						<Trash2 /> Entfernen
					</Button>
				</div>
			{/each}
			<Button variant="outline" size="sm" onclick={addCertification}><Plus /> Zertifikat</Button>
		</section>
	{/if}
</div>
