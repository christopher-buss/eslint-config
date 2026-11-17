import type { TypedFlatConfigItem } from "../types.ts";

export interface NodeRuleOptions {
	/**
	 * The Node major version the linted project targets, used to gate rules
	 * whose suggested APIs older runtimes lack. Rules stay off when it is
	 * undefined.
	 */
	nodeMajor?: number;
}

/** `Uint8Array#toHex` and `Uint8Array.fromHex` shipped in Node 25. */
const NODE_UINT8ARRAY_HEX = 25;

/**
 * Node.js rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function nodeRules({ nodeMajor }: NodeRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		"node/handle-callback-err": ["error", "^(err|error)$"],
		"node/no-deprecated-api": "error",
		"node/no-exports-assign": "error",
		"node/no-new-require": "error",
		"node/no-path-concat": "error",
		"node/prefer-global/buffer": ["error", "never"],
		"node/prefer-global/process": ["error", "never"],
		"node/prefer-node-protocol": "error",
		"node/process-exit-as-throw": "error",
		"unicorn/no-unsafe-sqlite-interpolation": "error",
		"unicorn/prefer-json-import": "error",

		...(nodeMajor !== undefined && nodeMajor >= NODE_UINT8ARRAY_HEX
			? { "unicorn/prefer-uint8array-hex": "error" }
			: {}),
	};
}
