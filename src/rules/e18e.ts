import type { TypedFlatConfigItem } from "../types.ts";

export interface E18eRuleOptions {
	modernization?: boolean;
	/**
	 * The Node major version the linted project targets, used to gate rules
	 * whose target syntax is not yet available on older runtimes. The factories
	 * resolve this from `settings.n.version` / `settings.node.version`, falling
	 * back to `engines.node`; rules stay off when it cannot be determined.
	 */
	nodeMajor?: number;
	performanceImprovements?: boolean;
}

/** `Map.prototype.getOrInsert` landed in V8 14.6, shipped in Node 26. */
const NODE_GET_OR_INSERT = 26;

/**
 * The e18e source rules shared between the ESLint and oxlint factories. Mirrors
 * the `modernization` and `performanceImprovements` presets of
 * `@e18e/eslint-plugin`; all rules are syntax-only (no type information).
 *
 * The `moduleReplacements` preset is not included here: its only rule,
 * `ban-dependencies`, has JSON-only visitors and so is applied separately
 * against `package.json` by the ESLint factory.
 *
 * @param options - Which preset groups to enable.
 * @returns The rule map.
 */
export function e18eRules({
	modernization = true,
	nodeMajor,
	performanceImprovements = true,
}: E18eRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		...(modernization
			? {
					"e18e/prefer-array-at": "error",
					"e18e/prefer-array-fill": "error",
					"e18e/prefer-array-to-reversed": "error",
					"e18e/prefer-array-to-sorted": "error",
					"e18e/prefer-array-to-spliced": "error",
					"e18e/prefer-includes": "error",
					"e18e/prefer-nullish-coalescing": "error",
					"e18e/prefer-object-has-own": "error",
					"e18e/prefer-spread-syntax": "error",
					"e18e/prefer-url-canparse": "error",

					...(nodeMajor !== undefined && nodeMajor >= NODE_GET_OR_INSERT
						? { "e18e/prefer-get-or-insert": "error" }
						: {}),
				}
			: {}),

		...(performanceImprovements
			? {
					"e18e/no-spread-in-reduce": "error",
					"e18e/prefer-array-from-map": "error",
					"e18e/prefer-array-some": "error",
					"e18e/prefer-date-now": "error",
					"e18e/prefer-includes-over-regex-test": "error",
					"e18e/prefer-regex-test": "error",
					"e18e/prefer-static-collator": "error",
					"e18e/prefer-static-regex": "error",
					"e18e/prefer-string-fromcharcode": "error",
					"e18e/prefer-timer-args": "error",
				}
			: {}),
	};
}
