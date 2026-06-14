import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SearchConfigEditor from './search-config-editor.svelte';

const config = {
	jobSearchKeywords: [],
	jobSearchLocations: [],
	businessOsmTags: [],
	businessRadiusMeters: 5000
};

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' }
	});
}

async function waitForDebounce() {
	await new Promise((resolve) => setTimeout(resolve, 350));
}

describe('SearchConfigEditor autocomplete', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders city suggestions and adds a selected city chip', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse({
					suggestions: [
						{
							id: '1',
							label: 'Wien (1010)',
							secondaryLabel: 'Österreich',
							city: 'Wien',
							postcode: '1010',
							lat: 48.2,
							lon: 16.3,
							countryCode: 'at',
							kind: 'city',
							verifiable: false
						}
					]
				})
			)
		);
		render(SearchConfigEditor, { config });

		const input = page.getByRole('combobox', { name: 'Job-Suchort hinzufügen' });
		await input.fill('Wie');
		await waitForDebounce();
		const suggestion = page.getByRole('option', { name: /Wien \(1010\)/ });

		await expect.element(suggestion).toBeVisible();
		await suggestion.click();
		await expect.element(page.getByText('Wien')).toBeVisible();
	});

	it('adds and removes an OSM tag chip from suggestions', async () => {
		render(SearchConfigEditor, { config: { ...config, jobSearchLocations: [] } });

		const input = page.getByRole('textbox', { name: 'OSM-Kategorie hinzufügen' });
		await input.fill('amenity=cafe');
		await waitForDebounce();
		const suggestion = page.getByRole('option', { name: /Amenity: Cafe/ });

		await expect.element(suggestion).toBeVisible();
		await suggestion.click();
		await expect.element(page.getByText('amenity=cafe')).toBeVisible();

		await page.getByRole('button', { name: 'amenity=cafe entfernen' }).click();
		await expect
			.element(page.getByRole('button', { name: 'amenity=cafe entfernen' }))
			.not.toBeInTheDocument();
	});

	it('renders field errors beside the affected search controls', async () => {
		render(SearchConfigEditor, {
			config,
			errors: {
				jobSearchLocations: ['Mindestens ein Suchort ist erforderlich.'],
				businessOsmTags: ['Mindestens eine Kategorie ist erforderlich.'],
				businessRadiusMeters: ['Die Entfernung ist ungültig.']
			}
		});

		await expect.element(page.getByText('Mindestens ein Suchort ist erforderlich.')).toBeVisible();
		await expect
			.element(page.getByText('Mindestens eine Kategorie ist erforderlich.'))
			.toBeVisible();
		await expect.element(page.getByText('Die Entfernung ist ungültig.')).toBeVisible();
	});
});
