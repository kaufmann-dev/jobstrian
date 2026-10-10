import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import StringListEditor from './string-list-editor.svelte';

describe('StringListEditor', () => {
	it('renders initial chips and emits removals', async () => {
		const onValuesChange = vi.fn();
		render(StringListEditor, {
			values: ['Deutsch (B1)', 'Englisch (C1)'],
			label: 'Sprachen mit Niveau',
			placeholder: 'Deutsch (B1), Englisch (C1)',
			onValuesChange
		});

		await expect.element(page.getByText('Deutsch (B1)')).toBeVisible();
		await expect.element(page.getByText('Englisch (C1)')).toBeVisible();

		await page.getByRole('button', { name: 'Deutsch (B1) entfernen' }).click();
		expect(onValuesChange).toHaveBeenCalledWith(['Englisch (C1)']);
	});

	it('adds pasted comma-separated values on blur and removes duplicates', async () => {
		const onValuesChange = vi.fn();
		render(StringListEditor, {
			values: ['Pflege'],
			label: 'Stellen-Keywords',
			placeholder: 'Pflegeassistenz, Verkauf, Office',
			onValuesChange
		});

		const input = page.getByRole('textbox', { name: 'Stellen-Keywords hinzufügen' });
		await input.fill(' Verkauf, Pflege, Office ');
		(await input.element()).blur();

		expect(onValuesChange).toHaveBeenCalledWith(['Pflege', 'Verkauf', 'Office']);
	});

	it('adds a value on Enter', async () => {
		const onValuesChange = vi.fn();
		render(StringListEditor, {
			values: [],
			label: 'Kenntnisse',
			placeholder: 'Espressozubereitung, Kassensysteme',
			onValuesChange
		});

		const input = page.getByRole('textbox', { name: 'Kenntnisse hinzufügen' });
		await input.fill('Latte Art');
		(await input.element()).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);

		expect(onValuesChange).toHaveBeenCalledWith(['Latte Art']);
		await expect.element(input).toHaveValue('');
	});

	it('adds a value on comma', async () => {
		const onValuesChange = vi.fn();
		render(StringListEditor, {
			values: [],
			label: 'Kenntnisse',
			placeholder: 'Espressozubereitung, Kassensysteme',
			onValuesChange
		});

		const input = page.getByRole('textbox', { name: 'Kenntnisse hinzufügen' });
		await input.fill('Kassensysteme');
		(await input.element()).dispatchEvent(
			new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true })
		);

		expect(onValuesChange).toHaveBeenCalledWith(['Kassensysteme']);
		await expect.element(input).toHaveValue('');
	});
});
