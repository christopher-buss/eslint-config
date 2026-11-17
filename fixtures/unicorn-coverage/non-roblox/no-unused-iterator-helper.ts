declare function transform(value: string): string;

export function run(items: Array<string>): void {
	items.values().map(transform);
}
