/**
 * Runs a callback per key, cancelling any call still pending for the same key.
 *
 * Editor events fire once per keystroke, so scheduling work directly from a
 * listener means a burst of typing queues one full run per character. Keying
 * the timer (by document URI, for example) collapses each burst into a single
 * run once the user pauses.
 */
export class KeyedDebouncer<K> {
	private readonly timers = new Map<K, ReturnType<typeof setTimeout>>();

	constructor(private readonly delayMs: number) {}

	/**
	 * Schedules `callback` for `key`, replacing any run still pending for it
	 */
	public schedule(key: K, callback: () => void): void {
		this.cancel(key);
		this.timers.set(key, setTimeout(() => {
			this.timers.delete(key);
			callback();
		}, this.delayMs));
	}

	/**
	 * Drops the pending run for `key`, if there is one
	 */
	public cancel(key: K): void {
		const timer = this.timers.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
	}

	public dispose(): void {
		this.timers.forEach(timer => clearTimeout(timer));
		this.timers.clear();
	}
}

/**
 * Single-slot variant of {@link KeyedDebouncer} for one recurring piece of work
 */
export class Debouncer {
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly delayMs: number) {}

	public schedule(callback: () => void): void {
		this.cancel();
		this.timer = setTimeout(() => {
			this.timer = undefined;
			callback();
		}, this.delayMs);
	}

	public cancel(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	public dispose(): void {
		this.cancel();
	}
}
