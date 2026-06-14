import { describe, expect, it, vi } from 'vitest';
import { SettingsAutosaveQueue, type SettingsPatchRequest } from './settings-autosave';

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('SettingsAutosaveQueue', () => {
	it('coalesces fields and serializes edits made during an in-flight save', async () => {
		const sent: SettingsPatchRequest[] = [];
		let release!: () => void;
		const send = vi.fn(async (patch: SettingsPatchRequest) => {
			sent.push(patch);
			if (sent.length === 1) await new Promise<void>((resolve) => (release = resolve));
		});
		const queue = new SettingsAutosaveQueue(send, vi.fn(), 0);
		queue.enqueueField('fullName', 'First');
		queue.enqueueField('fullName', 'Latest');
		await tick();
		queue.enqueueField('phone', '123');
		release();
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
		expect(sent).toEqual([{ patch: { fullName: 'Latest' } }, { patch: { phone: '123' } }]);
		expect(queue.isSaved()).toBe(true);
	});

	it('retains failed patches and retries them', async () => {
		const send = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValue(undefined);
		const statuses: string[] = [];
		const queue = new SettingsAutosaveQueue(send, (status) => statuses.push(status), 0);
		queue.enqueueField('email', 'a@example.com');
		await vi.waitFor(() => expect(statuses).toContain('error'));
		queue.retry();
		await vi.waitFor(() => expect(statuses.at(-1)).toBe('saved'));
		expect(send).toHaveBeenCalledTimes(2);
	});
});
