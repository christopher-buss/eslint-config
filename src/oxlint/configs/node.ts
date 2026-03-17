import { GLOB_SRC } from "../../globs.ts";
import type { JsPluginRules, OxlintRules, TypedOxlintConfigItem } from "../types.ts";

export function oxlintNode(): Array<TypedOxlintConfigItem> {
	const nativeRules = {
		"node/handle-callback-err": ["error", "^(err|error)$"],
		"node/no-exports-assign": "error",
		"node/no-new-require": "error",
		"node/no-path-concat": "error",
	} satisfies OxlintRules;

	const jsPluginRules = {
		"node-js/no-deprecated-api": "error",
		"node-js/prefer-global/buffer": ["error", "never"],
		"node-js/prefer-global/process": ["error", "never"],
		"node-js/prefer-node-protocol": "error",
		"node-js/process-exit-as-throw": "error",
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/node",
			files: [GLOB_SRC],
			plugins: ["node"],
			rules: nativeRules,
		},
		{
			name: "isentinel/oxlint/node/js-plugin",
			files: [GLOB_SRC],
			jsPlugins: [{ name: "node-js", specifier: "eslint-plugin-n" }],
			rules: jsPluginRules,
		},
	];
}
