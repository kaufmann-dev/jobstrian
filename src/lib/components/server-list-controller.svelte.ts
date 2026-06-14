import type { CursorPage } from '$lib/list-pages';

export class ServerListController<T> {
	items = $state.raw<T[]>([]);
	nextCursor = $state<string | null>(null);
	matchingTotal = $state(0);
	total = $state(0);
	loading = $state(false);
	error = $state('');
	private params = new URLSearchParams();
	private version = 0;

	constructor(
		private readonly endpoint: string,
		initial: CursorPage<T>,
		initialParams: Record<string, string> = {}
	) {
		this.params = new URLSearchParams(initialParams);
		this.apply(initial);
	}

	get hasMore(): boolean {
		return this.nextCursor !== null;
	}

	/** The currently active sort key, if any. */
	get sort(): string | null {
		return this.params.get('sort');
	}

	/** Update items in place without refetching (e.g. optimistic updates). */
	patch(match: (item: T) => boolean, update: (item: T) => T): void {
		this.items = this.items.map((item) => (match(item) ? update(item) : item));
	}

	/** Re-sort the loaded items in place (e.g. after an optimistic update changes order). */
	reorder(compare: (a: T, b: T) => number): void {
		this.items = [...this.items].sort(compare);
	}

	private apply(page: CursorPage<T>, append = false): void {
		this.items = append ? [...this.items, ...page.items] : page.items;
		this.nextCursor = page.nextCursor;
		this.matchingTotal = page.matchingTotal;
		this.total = page.total;
	}

	private async fetchPage(cursor: string | null): Promise<CursorPage<T>> {
		const params = new URLSearchParams(this.params);
		if (cursor) params.set('cursor', cursor);
		const response = await fetch(`${this.endpoint}?${params}`);
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { message?: string } | null;
			throw new Error(body?.message ?? `Daten konnten nicht geladen werden (${response.status}).`);
		}
		return (await response.json()) as CursorPage<T>;
	}

	async reset(patch: Record<string, string | null> = {}): Promise<void> {
		for (const [key, value] of Object.entries(patch)) {
			if (value === null || value === '') this.params.delete(key);
			else this.params.set(key, value);
		}
		const version = ++this.version;
		this.loading = true;
		this.error = '';
		try {
			const page = await this.fetchPage(null);
			if (version === this.version) this.apply(page);
		} catch (error) {
			if (version === this.version) {
				this.error = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (version === this.version) this.loading = false;
		}
	}

	async replaceParams(params: Record<string, string>): Promise<void> {
		this.params = new URLSearchParams(params);
		await this.reset();
	}

	async loadMore(): Promise<void> {
		if (this.loading || !this.nextCursor) return;
		const version = this.version;
		this.loading = true;
		this.error = '';
		try {
			const page = await this.fetchPage(this.nextCursor);
			if (version === this.version) this.apply(page, true);
		} catch (error) {
			if (version === this.version) {
				this.error = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (version === this.version) this.loading = false;
		}
	}
}
