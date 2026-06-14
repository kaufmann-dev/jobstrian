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

const profileWithHistory = {
	...profile,
	workExperience: [
		{
			position: 'Barista',
			employer: 'Cafe',
			location: 'Wien',
			startDate: '2025',
			endDate: '',
			description: ''
		}
	],
	educationHistory: [
		{
			qualification: 'Matura',
			institution: 'Schule',
			field: '',
			location: 'Wien',
			startDate: '2020',
			endDate: '2024',
			description: ''
		}
	],
	certifications: [{ name: 'HACCP', issuer: '', date: '', description: '' }]
};

afterEach(() => vi.unstubAllGlobals());

const verifiedAddressSuggestion = {
	id: 'geoapify-address-1',
	label: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
	secondaryLabel: '1080 Wien, Österreich',
	city: 'Wien',
	postcode: '1080',
	lat: 48.21234,
	lon: 16.34567,
	countryCode: 'at',
	kind: 'address' as const,
	verifiable: true
};

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' }
	});
}

async function waitForDebounce() {
	await new Promise((resolve) => setTimeout(resolve, 350));
}

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

it('passes verified suggestion metadata when an address suggestion is selected', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(jsonResponse({ suggestions: [verifiedAddressSuggestion] }))
	);
	const onHomeAddressChange = vi.fn();
	render(ProfileEditor, { profile: { ...profile }, onHomeAddressChange });

	const input = page.getByRole('combobox', { name: 'Adresse' });
	await input.fill('Fuhrmannsgasse 18a');
	await waitForDebounce();
	await page.getByRole('option', { name: /Fuhrmannsgasse 18a/ }).click();

	expect(onHomeAddressChange).toHaveBeenLastCalledWith(
		'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
		expect.objectContaining({
			id: 'geoapify-address-1',
			verifiable: true,
			city: 'Wien',
			postcode: '1080'
		})
	);
});

it('promotes exact loaded address text on blur to a verified suggestion', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(jsonResponse({ suggestions: [verifiedAddressSuggestion] }))
	);
	const onHomeAddressChange = vi.fn();
	render(ProfileEditor, { profile: { ...profile }, onHomeAddressChange });

	const input = page.getByRole('combobox', { name: 'Adresse' });
	await input.fill('Fuhrmannsgasse 18a, 1080 Wien, Österreich');
	await waitForDebounce();
	await expect.element(page.getByRole('option', { name: /Fuhrmannsgasse 18a/ })).toBeVisible();
	(await input.element()).blur();

	await vi.waitFor(() =>
		expect(onHomeAddressChange).toHaveBeenLastCalledWith(
			'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
			expect.objectContaining({ id: 'geoapify-address-1', verifiable: true })
		)
	);
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

it('collapses profile history by default and shows entry counts', async () => {
	render(ProfileEditor, { profile: profileWithHistory, collapsibleHistory: true });

	const workExperience = page.getByRole('button', { name: /Berufserfahrung 1/ });
	await expect.element(workExperience).toBeVisible();
	await expect.element(page.getByRole('textbox', { name: 'Position' })).not.toBeInTheDocument();

	await workExperience.click();
	await expect.element(page.getByRole('textbox', { name: 'Position' })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
		document.documentElement.clientWidth
	);
});

it('keeps profile history expanded when collapsible history is disabled', async () => {
	render(ProfileEditor, { profile: profileWithHistory });

	await expect.element(page.getByRole('textbox', { name: 'Position' })).toBeVisible();
	await expect.element(page.getByRole('textbox', { name: 'Abschluss' })).toBeVisible();
	await expect.element(page.getByRole('textbox', { name: 'Zertifikat' })).toBeVisible();
});

it('adds pasted comma-separated languages as removable chips', async () => {
	render(ProfileEditor, { profile });
	const input = page.getByRole('textbox', { name: 'Sprachen mit Niveau hinzufügen' });

	await input.fill('Deutsch (B1), Englisch (C1), Deutsch (B1)');
	(await input.element()).blur();

	await expect.element(page.getByText('Deutsch (B1)')).toBeVisible();
	await expect.element(page.getByText('Englisch (C1)')).toBeVisible();
	await page.getByRole('button', { name: 'Deutsch (B1) entfernen' }).click();
	await expect
		.element(page.getByRole('button', { name: 'Deutsch (B1) entfernen' }))
		.not.toBeInTheDocument();
});

it('adds skills as removable chips on comma', async () => {
	render(ProfileEditor, { profile });
	const input = page.getByRole('textbox', { name: 'Kenntnisse hinzufügen' });

	await input.fill('Latte Art');
	(await input.element()).dispatchEvent(
		new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true })
	);

	await expect.element(page.getByText('Latte Art')).toBeVisible();
	await expect.element(input).toHaveValue('');
});
