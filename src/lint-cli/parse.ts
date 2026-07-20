/**
 * Parse an integer that must be at least `min`, returning `undefined` for any
 * value that is missing, non-numeric, fractional or below the bound. The three
 * env-derived numeric knobs (concurrency, files-per-worker, affected-bust
 * threshold) share this parse and keep their differing failure actions
 * (undefined vs throw vs default) at their call sites.
 *
 * @param value - The raw string to parse (usually an environment variable).
 * @param min - The inclusive lower bound the parsed integer must meet.
 * @returns The parsed integer, or `undefined` when it is absent or invalid.
 */
export function parseBoundedInteger(value: string | undefined, min: number): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number(value.trim());
	if (!Number.isInteger(parsed) || parsed < min) {
		return undefined;
	}

	return parsed;
}
