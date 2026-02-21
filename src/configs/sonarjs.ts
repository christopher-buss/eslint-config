import type { OptionsIsInEditor, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export async function sonarjs(
	options: Required<OptionsIsInEditor>,
): Promise<Array<TypedFlatConfigItem>> {
	const { isInEditor } = options;

	const pluginSonar = await interopDefault(import("eslint-plugin-sonarjs"));

	return [
		{
			name: "isentinel/sonarjs",
			plugins: {
				sonar: pluginSonar,
			},
			rules: {
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
				"sonar/no-async-constructor": "error",
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
				"sonar/super-invocation": "error",
				"sonar/todo-tag": isInEditor ? "warn" : "off",
				"sonar/use-type-alias": "error",
			},
		},
	];
}
