import { GLOB_SRC } from "../../globs.ts";
import type { OxlintRules, TypedOxlintConfigItem } from "../types.ts";

export function promise(): Array<TypedOxlintConfigItem> {
	const nativeRules = {
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
		"promise/no-nesting": "warn",
		"promise/no-new-statics": "off",
		"promise/no-promise-in-callback": "warn",
		"promise/no-return-in-finally": "warn",
		"promise/no-return-wrap": "error",
		"promise/param-names": "warn",
		"promise/prefer-await-to-callbacks": "off",
		"promise/prefer-await-to-then": "off",
		"promise/prefer-catch": "error",
	} as const satisfies OxlintRules;

	return [
		{
			name: "isentinel/oxlint/promise",
			files: [GLOB_SRC],
			plugins: ["promise"],
			rules: nativeRules,
		},
	];
}
