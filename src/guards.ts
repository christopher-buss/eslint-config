/**
 * Internal runtime type guards. Prefer these over `as` assertions so values
 * crossing untyped boundaries (`JSON.parse`, dynamic `import`, plugin objects)
 * are validated at runtime rather than asserted away.
 */

/**
 * Whether a value is a non-null, non-array object usable as a string-keyed
 * record. Narrows `unknown` without an assertion.
 *
 * @param value - The value to test.
 * @returns Whether the value is a plain object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is an array whose every element is a string.
 *
 * @param value - The value to test.
 * @returns Whether the value is a `string` array.
 */
export function isStringArray(value: unknown): value is Array<string> {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}
