import { GLOB_SRC } from "../globs.ts";
import type { Rules, TypedFlatConfigItem, TypedOxlintConfigItem } from "../types.ts";
import { ensurePackages, interopDefault } from "../utils.ts";

export function nodeRules(): Rules {
	return {
		"node/handle-callback-err": ["error", "^(err|error)$"],
		"node/no-deprecated-api": "error",
		"node/no-exports-assign": "error",
		"node/no-new-require": "error",
		"node/no-path-concat": "error",
		"node/prefer-global/buffer": ["error", "never"],
		"node/prefer-global/process": ["error", "never"],
		"node/prefer-node-protocol": "error",
		"node/process-exit-as-throw": "error",
	};
}

export function oxlintNode(): Array<TypedOxlintConfigItem> {
	const allRules = nodeRules();

	// TODO(oxlint): not yet implemented
	// handle-callback-err, no-deprecated-api, prefer-global/buffer,
	// prefer-global/process, prefer-node-protocol, process-exit-as-throw
	const omitRules = new Set([
		"node/handle-callback-err",
		"node/no-deprecated-api",
		"node/prefer-global/buffer",
		"node/prefer-global/process",
		"node/prefer-node-protocol",
		"node/process-exit-as-throw",
	]);

	const filteredRules: Rules = {};
	for (const [key, value] of Object.entries(allRules)) {
		if (!omitRules.has(key)) {
			filteredRules[key] = value;
		}
	}

	return [
		{
			name: "isentinel/node",
			files: [GLOB_SRC],
			plugins: ["node"],
			rules: filteredRules,
		},
	];
}

export async function node(): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-n"]);

	const pluginNode = await interopDefault(import("eslint-plugin-n"));

	return [
		{
			name: "isentinel/node/rules",
			files: [GLOB_SRC],
			plugins: {
				node: pluginNode,
			},
			rules: nodeRules(),
		},
	];
}
