import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
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
		detail: 'Cafe Test: geplant 09:00',
		skipped: 2,
		failed: 1
	}
];

it('shows the active phase progress collapsed and expands phase details from the toggle', async () => {
	render(RunStatusCard, {
		title: 'Automatischer Bewerbungsversand',
		statusLabel: 'läuft',
		meta: '10m 49s',
		summary: '790 neue Betriebe mit E-Mail und Entwurf sind offen.',
		active: true,
		phases
	});

	await expect.element(page.getByText('Automatischer Bewerbungsversand')).toBeVisible();
	await expect.element(page.getByText('10m 49s')).toBeVisible();
	// Running: the redundant status badge is dropped and the vague summary is replaced by the
	// active phase progress meter (label + count + bar).
	await expect.element(page.getByText('läuft')).not.toBeInTheDocument();
	await expect
		.element(page.getByText('790 neue Betriebe mit E-Mail und Entwurf sind offen.'))
		.not.toBeInTheDocument();
	await expect.element(page.getByText('Versand', { exact: true })).toBeVisible();
	await expect.element(page.getByText('12 / 20')).toBeVisible();
	await expect.element(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
	// Per-phase detail stays hidden until expanded.
	await expect.element(page.getByText('Cafe Test: geplant 09:00')).not.toBeInTheDocument();

	const toggle = page.getByRole('button', { name: 'Details ausklappen' });
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();

	await expect
		.element(page.getByRole('button', { name: 'Details einklappen' }))
		.toHaveAttribute('aria-expanded', 'true');
	// Assert only expand-only content; phase label / count / bar now also exist in the header meter.
	await expect.element(page.getByText('1 fehlgeschlagen')).toBeVisible();
	await expect.element(page.getByText('2 übersprungen')).toBeVisible();
	await expect.element(page.getByText('Cafe Test: geplant 09:00')).toBeVisible();
});

it('shows the status badge and summary when not active', async () => {
	render(RunStatusCard, {
		title: 'Automatischer Bewerbungsversand',
		statusLabel: 'fertig',
		summary: '3 Bewertungen fehlgeschlagen.',
		active: false
	});

	await expect.element(page.getByText('fertig')).toBeVisible();
	await expect.element(page.getByText('3 Bewertungen fehlgeschlagen.')).toBeVisible();
});
