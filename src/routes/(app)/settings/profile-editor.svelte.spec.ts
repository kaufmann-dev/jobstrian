import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
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

afterEach(() => vi.unstubAllGlobals());

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

it('shows the deployment configuration error returned by the server', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			Response.json(
				{
					code: 'not_configured',
					message: 'GEOAPIFY_API_KEY ist in der Deployment-Umgebung nicht konfiguriert.'
				},
				{ status: 503 }
			)
		)
	);
	render(ProfileEditor, { profile });

	await page.getByRole('combobox', { name: 'Adresse' }).fill('Herrengasse');
	await expect
		.element(page.getByText('GEOAPIFY_API_KEY ist in der Deployment-Umgebung nicht konfiguriert.'))
		.toBeVisible();
});
