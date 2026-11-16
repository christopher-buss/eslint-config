interface Context {
	cancelled: boolean;
	finished: boolean;
}

declare function work(): void;

export function check(context: Context): void {
	if (context.finished) {
		return;
	}

	if (context.cancelled) {
		return;
	}

	work();
}
