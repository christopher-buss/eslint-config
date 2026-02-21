import type { OptionsIsInEditor, OptionsStylistic, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export async function ceaseNonsense(
	options: OptionsIsInEditor & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { isInEditor = false, stylistic = true } = options;

	const pluginCeaseNonsense = await interopDefault(
		import("@pobammer-ts/eslint-cease-nonsense-rules"),
	);

	return [
		{
			name: "isentinel/cease-nonsense",
			plugins: {
				"cease-nonsense": pluginCeaseNonsense,
			},
			rules: {
				"cease-nonsense/no-commented-code": isInEditor ? "off" : "error",
				"cease-nonsense/prefer-class-properties": "error",
				"cease-nonsense/prefer-early-return": ["error", { maximumStatements: 1 }],
				"cease-nonsense/react-hooks-strict-return": "error",
				"cease-nonsense/strict-component-boundaries": "error",

				...(stylistic !== false
					? {
							"cease-nonsense/prefer-module-scope-constants": "error",
							"cease-nonsense/prefer-singular-enums": "error",
						}
					: {}),
			},
		},
	];
}
