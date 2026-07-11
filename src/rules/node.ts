import type { TypedFlatConfigItem } from "../types.ts";

/**
 * Node.js rules shared between the ESLint and oxlint factories.
 *
 * @returns The rule map.
 */
export function nodeRules(): TypedFlatConfigItem["rules"] {
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
	};
}
