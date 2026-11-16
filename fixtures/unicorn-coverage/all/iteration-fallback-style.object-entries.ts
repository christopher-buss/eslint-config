declare function use(key: string, value: number): void;

export function run(config?: Record<string, number>): void {
	for (const [key, value] of Object.entries(config ?? {})) {
		use(key, value);
	}
}
