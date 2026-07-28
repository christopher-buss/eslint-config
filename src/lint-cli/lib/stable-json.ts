import { isRecord } from "../../guards.ts";

/**
 * Serialize a value to JSON with object keys sorted at every depth so a digest
 * taken over it is insensitive to key ordering. Shared by every hash in the CLI
 * that digests a parsed object rather than raw file text.
 *
 * @param value - The value to stringify.
 * @returns The stable JSON string.
 */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	if (isRecord(value)) {
		const entries = Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
		return `{${entries.join(",")}}`;
	}

	return JSON.stringify(value);
}
