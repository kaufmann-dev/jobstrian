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
		void this.flush();
	}

	isSaved(): boolean {
		return !this.timer && !this.inFlight && empty(this.pending);
	}

	private schedule(): void {
		this.clearTimer();
		this.onStatus('idle');
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, this.debounceMs);
	}

	private clearTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}

	private async flush(): Promise<void> {
		if (this.inFlight || empty(this.pending)) return;
		const request = this.pending;
		this.pending = { patch: {} };
		this.inFlight = true;
		this.onStatus('saving');
		try {
			await this.send(request);
			this.inFlight = false;
			if (!empty(this.pending)) {
				await this.flush();
			} else {
				this.onStatus('saved');
			}
		} catch {
			this.inFlight = false;
			this.pending = {
				patch: { ...request.patch, ...this.pending.patch },
				homeLocation: this.pending.homeLocation ?? request.homeLocation
			};
			this.onStatus('error');
		}
	}
}
