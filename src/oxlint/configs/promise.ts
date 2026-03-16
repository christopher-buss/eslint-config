import { GLOB_SRC } from "../../globs.ts";
import type { Rules, TypedOxlintConfigItem } from "../types.ts";

export function oxlintPromise(): Array<TypedOxlintConfigItem> {
	// Inlined from promiseRules()
	const rules: Rules = {
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
	};

	return [
		{
			name: "isentinel/promise",
			files: [GLOB_SRC],
			plugins: ["promise"],
			rules,
		},
	];
}
