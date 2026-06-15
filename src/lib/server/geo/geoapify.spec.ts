import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geoSuggestions, normalizeGeoapifyResult, resetGeoapifyStateForTests } from './geoapify';

const complete = {
	place_id: 'place-1',
	formatted: 'Herrengasse 14, 1010 Wien, Österreich',
	address_line2: '1010 Wien, Österreich',
	city: 'Wien',
	postcode: '1010',
	country_code: 'at',
	street: 'Herrengasse',
	housenumber: '14',
	lat: 48.2101,
	lon: 16.3652
};

describe('Geoapify suggestions', () => {
	beforeEach(() => resetGeoapifyStateForTests());
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('normalizes only Austrian results and verifies complete addresses', () => {
		expect(normalizeGeoapifyResult(complete, 'address')).toMatchObject({
			id: 'place-1',
			city: 'Wien',
			postcode: '1010',
			countryCode: 'at',
			kind: 'address',
			verifiable: true
		});
		expect(
			normalizeGeoapifyResult(
				{ ...complete, place_id: 'place-2', housenumber: undefined },
				'address'
			)
		).toMatchObject({ verifiable: false });
		expect(normalizeGeoapifyResult({ ...complete, country_code: 'de' }, 'address')).toBeNull();
	});

	it('caches results and deduplicates in-flight requests', async () => {
		let resolve!: (response: Response) => void;
		const fetchMock = vi.fn(() => new Promise<Response>((done) => (resolve = done)));
		vi.stubGlobal('fetch', fetchMock);

		const first = geoSuggestions('Herrengasse 14', 'address', 'key');
		const second = geoSuggestions('Herrengasse 14', 'address', 'key');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		resolve(Response.json({ results: [complete] }));
		await expect(Promise.all([first, second])).resolves.toHaveLength(2);
		await geoSuggestions('Herrengasse 14', 'address', 'key');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns structured configuration and upstream errors', async () => {
		await expect(geoSuggestions('Wien', 'city', '   ')).rejects.toMatchObject({
			code: 'not_configured',
			status: 503
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
		await expect(geoSuggestions('Wien', 'city', 'key')).rejects.toMatchObject({
			code: 'rate_limited',
			status: 503
		});
	});

	it('distinguishes rejected provider credentials', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
		await expect(geoSuggestions('Wien', 'city', 'bad-key')).rejects.toMatchObject({
			code: 'provider_auth_failed',
			status: 502
		});
	});

	it('times out unavailable upstream requests after five seconds', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn((_url, init) => {
				return new Promise<Response>((_resolve, reject) => {
					(init?.signal as AbortSignal).addEventListener('abort', () =>
						reject(new DOMException('aborted', 'AbortError'))
					);
				});
			})
		);
		const request = geoSuggestions('Salzburg', 'city', 'key');
		const assertion = expect(request).rejects.toMatchObject({ code: 'upstream_unavailable' });
		await vi.advanceTimersByTimeAsync(5_000);
		await assertion;
		vi.useRealTimers();
	});

	it('limits upstream starts to four per second', async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(Response.json({ results: [] })));
		vi.stubGlobal('fetch', fetchMock);
		const requests = ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck'].map((city) =>
			geoSuggestions(city, 'city', 'key')
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		await vi.advanceTimersByTimeAsync(1_000);
		await Promise.all(requests);
		expect(fetchMock).toHaveBeenCalledTimes(5);
		vi.useRealTimers();
	});
});
