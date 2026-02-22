import type { OxlintConfigFragment } from "../oxlint";
import type { Rules, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export function promiseRules(): Rules {
	return {
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
}

export function oxlintPromise(): OxlintConfigFragment {
	return {
		plugins: ["promise"],
		rules: promiseRules() as OxlintConfigFragment["rules"],
	};
}

export async function promise(): Promise<Array<TypedFlatConfigItem>> {
	// @ts-expect-error -- No types
	const pluginPromise = await interopDefault(import("eslint-plugin-promise"));

	return [
		{
			name: "isentinel/promise",
			plugins: {
				promise: pluginPromise,
			},
			rules: promiseRules(),
		},
	];
}
