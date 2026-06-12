import type { CursorPage } from '$lib/list-pages';

export class InfiniteListController<T> {
	items = $state.raw<T[]>([]);
	nextCursor = $state<string | null>(null);
	matchingTotal = $state(0);
	total = $state(0);
	loading = $state(false);
	error = $state('');
	private query = '';
	private version = 0;

	constructor(
		private readonly endpoint: string,
		initial: CursorPage<T>
	) {
		this.apply(initial);
	}

	get hasMore(): boolean {
		return this.nextCursor !== null;
	}

	private apply(page: CursorPage<T>, append = false): void {
		this.items = append ? [...this.items, ...page.items] : page.items;
		this.nextCursor = page.nextCursor;
		this.matchingTotal = page.matchingTotal;
		this.total = page.total;
	}

	private async fetchPage(cursor: string | null): Promise<CursorPage<T>> {
		const params = new URLSearchParams(this.query);
		if (cursor) params.set('cursor', cursor);
		const response = await fetch(`${this.endpoint}?${params}`);
		if (!response.ok) throw new Error(`Daten konnten nicht geladen werden (${response.status}).`);
		return (await response.json()) as CursorPage<T>;
	}

	async reset(query = ''): Promise<void> {
		const version = ++this.version;
		this.loading = true;
		this.error = '';
		this.query = query;
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
