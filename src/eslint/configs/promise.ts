import { promiseRules } from "../../rules/promise.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export function promise(): Array<TypedFlatConfigItem> {
	const pluginPromise = lazyPlugin("eslint-plugin-promise");

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
