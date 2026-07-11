import { promiseRules } from "../../rules/promise.ts";
import { interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types.ts";

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
