import { GLOB_SRC } from "../../globs.ts";
import { interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types";

export async function promise(): Promise<Array<TypedFlatConfigItem>> {
	// @ts-expect-error -- No types
	const pluginPromise = await interopDefault(import("eslint-plugin-promise"));

	return [
		{
			name: "isentinel/promise",
			files: [GLOB_SRC],
			plugins: {
				promise: pluginPromise,
			},
			rules: {
				"promise/always-return": [
					"error",
					{
						ignoreLastCallback: true,
					},
				],
				"promise/avoid-new": "off",
				"promise/catch-or-return": [
					"error",
					{
						allowFinally: true,
						allowThen: true,
					},
				],
				"promise/no-callback-in-promise": "off",
				"promise/no-multiple-resolved": "error",
				"promise/no-native": "off",
				"promise/no-nesting": "warn",
				"promise/no-new-statics": "off",
				"promise/no-promise-in-callback": "warn",
				"promise/no-return-in-finally": "warn",
				"promise/no-return-wrap": "error",
				"promise/param-names": "warn",
				"promise/prefer-await-to-callbacks": "off",
				"promise/prefer-await-to-then": "off",
				"promise/prefer-catch": "error",
			},
		},
	];
}
