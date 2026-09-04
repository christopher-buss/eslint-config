/**
 * Internal runtime type guards. Prefer these over `as` assertions so values
 * crossing untyped boundaries (`JSON.parse`, dynamic `import`, plugin objects)
 * are validated at runtime rather than asserted away.
 */

/** A JSON array, once parsed. */
export type JsonArray = Array<JsonValue>;

/** A JSON object, once parsed: string keys, JSON values. */
export interface JsonObject {
	[key: string]: JsonValue;
}

/**
 * Any value `JSON.parse` can produce. Use this as the type of data read from a
 * manifest, a lockfile or a config file, instead of an open `unknown`
 * dictionary: the shape stays honest and every read still has to narrow.
 */
export type JsonValue = boolean | JsonArray | JsonObject | null | number | string;

/**
 * Whether a value is a JSON object: non-null, non-array, string-keyed. Use it
 * at a parse boundary, where {@link isRecord} would widen the values to
 * `unknown`.
 *
 * @param value - The value to test.
 * @returns Whether the value is a JSON object.
 */
export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a non-null, non-array object usable as a string-keyed
 * record. Narrows `unknown` without an assertion.
 *
 * @param value - The value to test.
 * @returns Whether the value is a plain object.
 */
export function isRecord(value: unknown): value is JsonObject {
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
