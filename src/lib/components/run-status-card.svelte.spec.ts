import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import RunStatusCard, { type RunStatusCardPhase } from './run-status-card.svelte';

const phases: RunStatusCardPhase[] = [
	{
		id: 'setup',
		label: 'Vorbereitung',
		state: 'done',
		current: 1,
		total: 1,
		detail: '',
		skipped: 0,
		failed: 0
	},
	{
		id: 'send',
		label: 'Versand',
		state: 'running',
		current: 12,
		total: 20,
		detail: 'Interne Detailzeile',
		skipped: 2,
		failed: 1
	}
];

const metrics = createRawSnippet(() => ({
	render: () => '<p>0 gesendet · 1 fehlgeschlagen · 19 offen</p>'
}));

const actions = createRawSnippet(() => ({
	render: () => '<button type="button">Abbrechen</button>'
}));

it('renders the summary collapsed and expands phase details from the toggle', async () => {
	render(RunStatusCard, {
		title: 'Automatischer Bewerbungsversand',
		statusLabel: 'läuft',
		meta: '10m 49s',
		summary: '790 neue Betriebe mit E-Mail und Entwurf sind offen.',
		active: true,
		phases,
		metrics,
		actions
	});

	await expect.element(page.getByText('Automatischer Bewerbungsversand')).toBeVisible();
	await expect.element(page.getByText('läuft')).toBeVisible();
	await expect.element(page.getByText('10m 49s')).toBeVisible();
	await expect
		.element(page.getByText('790 neue Betriebe mit E-Mail und Entwurf sind offen.'))
		.toBeVisible();
	await expect.element(page.getByText('0 gesendet · 1 fehlgeschlagen · 19 offen')).toBeVisible();
	await expect.element(page.getByText('Abbrechen')).toBeVisible();
	await expect.element(page.getByText('Interne Detailzeile')).not.toBeInTheDocument();
	await expect.element(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');

	const toggle = page.getByRole('button', { name: 'Details anzeigen' });
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();

	await expect
		.element(page.getByRole('button', { name: 'Details ausblenden' }))
		.toHaveAttribute('aria-expanded', 'true');
	await expect.element(page.getByText('1 fehlgeschlagen', { exact: true })).toBeVisible();
	await expect.element(page.getByText('2 übersprungen')).toBeVisible();
	await expect.element(page.getByText('Interne Detailzeile')).toBeVisible();
});

it('keeps the full title on one line in a narrow container', async () => {
	const view = render(RunStatusCard, {
		title: 'Automatischer Bewerbungsversand',
		statusLabel: 'läuft',
		summary: 'Versand · Bereit',
		active: true,
		phases,
		actions
	});

	view.container.style.width = '360px';
	view.container.style.maxWidth = '360px';
	await new Promise((resolve) => requestAnimationFrame(resolve));

	const title = view.container.querySelector('[data-slot="card-title"]');
	expect(title).toBeInstanceOf(HTMLElement);
	expect((title as HTMLElement).scrollWidth).toBeLessThanOrEqual(
		(title as HTMLElement).clientWidth
	);
});
