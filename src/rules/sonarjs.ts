import type { OptionsHasRoblox, OptionsIsInEditor, TypedFlatConfigItem } from "../types.ts";

/**
 * SonarJS rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function sonarjsRules({
	isInEditor,
	roblox = true,
}: OptionsHasRoblox & Required<OptionsIsInEditor>): TypedFlatConfigItem["rules"] {
	return {
		"sonar/bool-param-default": "error",
		"sonar/cognitive-complexity": "warn",
		"sonar/constructor-for-side-effects": "error",
		"sonar/destructuring-assignment-syntax": "error",
		"sonar/elseif-without-else": "off",
		"sonar/file-name-differ-from-class": "error",
		"sonar/fixme-tag": isInEditor ? "warn" : "off",
		"sonar/max-switch-cases": "error",
		"sonar/misplaced-loop-counter": "error",
		"sonar/no-all-duplicated-branches": "error",
		"sonar/no-collapsible-if": "error",
		"sonar/no-commented-code": "off",
		"sonar/no-dead-store": "error",
		"sonar/no-duplicate-string": [
			"error",
			{
				ignoreStrings: "Not implemented",
			},
		],
		"sonar/no-duplicated-branches": "error",
		"sonar/no-element-overwrite": "error",
		"sonar/no-empty-collection": "error",
		"sonar/no-floating-point-equality": "error",
		"sonar/no-gratuitous-expressions": "off",
		"sonar/no-identical-conditions": "error",
		"sonar/no-identical-expressions": "error",
		"sonar/no-identical-functions": "error",
		"sonar/no-ignored-return": "error",
		"sonar/no-inverted-boolean-check": "error",
		"sonar/no-nested-conditional": "error",
		"sonar/no-nested-incdec": "error",
		"sonar/no-nested-switch": "error",
		"sonar/no-nested-template-literals": "error",
		"sonar/no-parameter-reassignment": "error",
		"sonar/no-redundant-boolean": "error",
		"sonar/no-redundant-jump": "error",
		"sonar/no-redundant-optional": "error",
		"sonar/no-try-promise": "error",
		"sonar/no-unthrown-error": "error",
		"sonar/no-unused-collection": "error",
		"sonar/no-use-of-empty-return-value": "error",
		"sonar/no-useless-catch": "error",
		"sonar/no-useless-increment": "error",
		"sonar/non-existent-operator": "error",
		"sonar/prefer-immediate-return": "error",
		"sonar/prefer-object-literal": "error",
		"sonar/prefer-promise-shorthand": "error",
		"sonar/prefer-single-boolean-return": "error",
		"sonar/prefer-while": "error",
		"sonar/public-static-readonly": "error",
		"sonar/todo-tag": isInEditor ? "warn" : "off",
		"sonar/use-type-alias": "error",
		...(!roblox
			? {
					"sonar/no-default-utility-imports": "error",
					"sonar/super-linear-regex": "error",
				}
			: {}),
	};
}

/**
 * SonarJS rules that only apply to test files.
 *
 * `no-mixed-completion-style` and `synchronous-suite-callback` are jest-only:
 * both exclude vitest by design, since vitest awaits the suite callback and
 * does not support the `done` callback, so neither reports in a vitest file.
 *
 * `super-linear-regex` is turned off for test files (mirroring its `!roblox`
 * gating in {@link sonarjsRules}): test files carry adversarial/edge-case
 * patterns and are not attack surface, so its ReDoS warning is noise there.
 *
 * @param options - Which test framework the rules are being enabled for.
 * @returns The rule map.
 */
export function sonarjsTestRules({
	jest = false,
	roblox = true,
}: { jest?: boolean; roblox?: boolean } = {}): TypedFlatConfigItem["rules"] {
	return {
		"sonar/no-incompatible-assertion-types": "error",
		"sonar/no-trivial-assertions": "error",
		...(jest
			? {
					"sonar/no-mixed-completion-style": "error",
					"sonar/synchronous-suite-callback": "error",
				}
			: {}),
		...(!roblox ? { "sonar/super-linear-regex": "off" } : {}),
	};
}
