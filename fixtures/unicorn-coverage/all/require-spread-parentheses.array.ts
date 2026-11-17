export function combine(first: Array<number> | undefined, second: Array<number>): Array<number> {
	return [...first ?? second];
}
