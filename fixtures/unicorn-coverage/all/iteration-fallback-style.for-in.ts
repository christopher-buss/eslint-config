declare function use(key: string): void;

export function run(config?: Record<string, number>): void {
	for (const key in config ?? {}) {
		use(key);
	}
}
