declare function use(item: string): void;

export function run(items?: Array<string>): void {
	for (const item of items ?? []) {
		use(item);
	}
}
