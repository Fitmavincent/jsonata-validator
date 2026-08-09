/**
 * Runs a callback, cancelling any call still pending for the same key.
 *
 * Editor events fire once per keystroke, so scheduling work directly from a
 * listener means a burst of typing queues one full run per character. Pass a
 * key (a document URI, say) to debounce each subject independently; omit it
 * when there is only one thing to debounce.
 */
export class Debouncer<K = string> {
	private readonly timers = new Map<K | undefined, ReturnType<typeof setTimeout>>();

	constructor(private readonly delayMs: number) {}

	public schedule(callback: () => void, key?: K): void {
		this.cancel(key);
		this.timers.set(key, setTimeout(() => {
			this.timers.delete(key);
			callback();
		}, this.delayMs));
	}

	public cancel(key?: K): void {
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
