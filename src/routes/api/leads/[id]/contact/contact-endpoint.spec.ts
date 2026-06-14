import { beforeEach, describe, expect, it, vi } from 'vitest';

const { update, set, where, returning } = vi.hoisted(() => ({
	update: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
	returning: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	db: { update }
}));

import { PATCH } from './+server';

describe('PATCH /api/leads/[id]/contact', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		update.mockReturnValue({ set });
		set.mockReturnValue({ where });
		where.mockReturnValue({ returning });
	});

	it('stores normalized manual contact values', async () => {
		returning.mockResolvedValue([
			{
				id: 7,
				phone: '+43 1 234',
				email: 'jobs@example.com',
				website: 'https://example.com/jobs'
			}
		]);

		const response = await PATCH({
			params: { id: '7' },
			request: new Request('http://localhost/api/leads/7/contact', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					phone: ' +43 1 234 ',
					email: ' JOBS@EXAMPLE.COM ',
					website: ' https://example.com/jobs '
				})
			})
		} as never);

		expect(response.status).toBe(200);
		expect(set).toHaveBeenCalledWith({
			phone: '+43 1 234',
			phoneManual: true,
			email: 'jobs@example.com',
			emailManual: true,
			emailSource: 'manual',
			website: 'https://example.com/jobs',
			websiteManual: true,
			contentHash: null
		});
	});

	it('persists manual contact deletions', async () => {
		returning.mockResolvedValue([{ id: 7, email: null, website: null }]);

		const response = await PATCH({
			params: { id: '7' },
			request: new Request('http://localhost/api/leads/7/contact', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: '', website: '' })
			})
		} as never);

		expect(response.status).toBe(200);
		expect(set).toHaveBeenCalledWith({
			email: null,
			emailManual: true,
			emailSource: null,
			website: null,
			websiteManual: true,
			contentHash: null
		});
	});

	it('rejects invalid contact updates and missing leads', async () => {
		const invalid = await PATCH({
			params: { id: '7' },
			request: new Request('http://localhost/api/leads/7/contact', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'invalid' })
			})
		} as never);
		expect(invalid.status).toBe(400);

		returning.mockResolvedValue([]);
		const missing = await PATCH({
			params: { id: '7' },
			request: new Request('http://localhost/api/leads/7/contact', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phone: null })
			})
		} as never);
		expect(missing.status).toBe(404);
	});
});
