type Counts = Record<string, number>;

export function merge(isEnabled: boolean, overrides: Counts): Counts {
	return { ...isEnabled && overrides };
}
