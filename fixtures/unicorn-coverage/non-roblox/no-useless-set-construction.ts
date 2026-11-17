export function merge(selected: Set<number>, other: Set<number>): Set<number> {
	return selected.union(new Set(other));
}
