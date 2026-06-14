import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import ProfileEditor from './profile-editor.svelte';

const profile = {
	fullName: '',
	phone: '',
	email: '',
	profileText: '',
	languages: [],
	germanLevel: '',
	experienceYears: null,
	educationStatus: 'Matura',
	availability: '',
	homeAddress: '',
	skills: [],
	workExperience: [],
	educationHistory: [],
	certifications: []
};

it('keeps manual scalar edits after blur', async () => {
	render(ProfileEditor, { profile });
	const input = page.getByRole('textbox', { name: 'Ausbildung / Status' });

	await input.fill('Studium laufend');
	(await input.element()).blur();

	await expect.element(input).toHaveValue('Studium laufend');
});

it('does not overwrite the typed address on blur', async () => {
	render(ProfileEditor, { profile });
	const input = page.getByRole('combobox', { name: 'Adresse' });

	await input.fill('Fuhrmannsgasse 18');
	(await input.element()).blur();

	await expect.element(input).toHaveValue('Fuhrmannsgasse 18');
});
