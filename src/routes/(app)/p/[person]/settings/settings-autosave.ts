export type HomeLocationPatch =
	| { address: string; verified: false }
	| {
			address: string;
			verified: true;
			provider: 'geoapify';
			id: string;
			postcode: string;
			city: string;
			lat: number;
			lon: number;
	  };

export type SettingsPatchRequest = {
	patch: Record<string, unknown>;
	homeLocation?: HomeLocationPatch;
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function empty(request: SettingsPatchRequest): boolean {
	return Object.keys(request.patch).length === 0 && !request.homeLocation;
}

function copy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export class SettingsAutosaveQueue {
	private pending: SettingsPatchRequest = { patch: {} };
	private inFlight = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private activeFlush: Promise<void> | undefined;

	constructor(
		private readonly send: (patch: SettingsPatchRequest) => Promise<void>,
		private readonly onStatus: (status: SaveStatus) => void,
		private readonly debounceMs = 700
	) {}

	enqueueField(field: string, value: unknown): void {
		this.pending.patch[field] = copy(value);
		this.schedule();
	}

	enqueueHomeLocation(homeLocation: HomeLocationPatch): void {
		this.pending.homeLocation = copy(homeLocation);
		this.schedule();
	}

	retry(): void {
		if (empty(this.pending) || this.inFlight) return;
		this.clearTimer();
		void this.runFlush();
	}

	isSaved(): boolean {
		return !this.timer && !this.inFlight && empty(this.pending);
	}

	flush(): Promise<void> {
		if (this.isSaved()) return Promise.resolve();
		this.clearTimer();
		return this.runFlush();
	}

	private schedule(): void {
		if (this.activeFlush || this.inFlight) return;
		this.clearTimer();
		this.onStatus('idle');
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.runFlush();
		}, this.debounceMs);
	}

	private clearTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}

	private runFlush(): Promise<void> {
		if (!this.activeFlush) {
			this.activeFlush = this.flushPending().finally(() => {
				this.activeFlush = undefined;
			});
		}
		return this.activeFlush;
	}

	private async flushPending(): Promise<void> {
		if (this.inFlight) return;
		let sent = false;
		while (!empty(this.pending)) {
			sent = true;
			const request = this.pending;
			this.pending = { patch: {} };
			this.inFlight = true;
			this.onStatus('saving');
			try {
				await this.send(request);
			} catch {
				this.pending = {
					patch: { ...request.patch, ...this.pending.patch },
					homeLocation: this.pending.homeLocation ?? request.homeLocation
				};
				this.onStatus('error');
				return;
			} finally {
				this.inFlight = false;
			}
		}
		if (sent) this.onStatus('saved');
	}
}
