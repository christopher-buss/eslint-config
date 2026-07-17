import { GLOB_SRC } from "../../globs.ts";
import type { OptionsFiles, OptionsHasRoblox } from "../../types.ts";
import type { OxlintRules, TypedOxlintConfigItem } from "../types.ts";

/**
 * Oxlint's native `oxc/*` rules: correctness, performance and suspicious-pattern
 * checks with no ESLint equivalent, so they only run under oxlint.
 *
 * The rules are emitted as a raw fragment (`plugins: ["oxc"]` with literal
 * `oxc/*` names) rather than through the shared `createOxlintConfigs` helper,
 * since the canonical-name translation layer only knows rules that exist on the
 * ESLint side.
 *
 * @param options - Shared rule options.
 * @returns The oxc config fragment.
 */
export function oxlintOxc(
	options: OptionsFiles & OptionsHasRoblox & { excludeFiles?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const { excludeFiles, roblox = true } = options;

	const files = options.files?.flat() ?? [GLOB_SRC];

	return [
		{
			name: "isentinel/oxc",
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			plugins: ["oxc"],
			rules: {
				"oxc/approx-constant": "error",
				"oxc/bad-array-method-on-arguments": "error",
				"oxc/bad-char-at-comparison": "error",
				"oxc/bad-comparison-sequence": "error",
				"oxc/bad-min-max-func": "error",
				"oxc/bad-object-literal-comparison": "error",
				"oxc/bad-replace-all-arg": "error",
				"oxc/branches-sharing-code": "error",
				"oxc/const-comparisons": "error",
				"oxc/double-comparisons": "error",
				"oxc/erasing-op": "error",
				"oxc/misrefactored-assign-op": "error",
				"oxc/missing-throw": "error",
				"oxc/no-accumulating-spread": "error",
				"oxc/no-barrel-file": "error",
				"oxc/no-map-spread": "error",
				"oxc/no-this-in-exported-function": "error",
				"oxc/number-arg-out-of-range": "error",
				"oxc/only-used-in-recursion": "error",
				"oxc/uninvoked-array-callback": "error",

				...(!roblox
					? {
							"oxc/bad-bitwise-operator": "error",
							"oxc/no-const-enum": "error",
						}
					: {}),
			} satisfies OxlintRules,
		},
	];
}
