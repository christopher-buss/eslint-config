import { GLOB_SRC } from "../../globs.ts";
import type { TypedFlatConfigItem } from "../../types.ts";
import { ensurePackages, interopDefault } from "../../utils.ts";

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
			rules: {
				"node/handle-callback-err": ["error", "^(err|error)$"],
				"node/no-deprecated-api": "error",
				"node/no-exports-assign": "error",
				"node/no-new-require": "error",
				"node/no-path-concat": "error",
				"node/prefer-global/buffer": ["error", "never"],
				"node/prefer-global/process": ["error", "never"],
				"node/prefer-node-protocol": "error",
				"node/process-exit-as-throw": "error",
			},
		},
	];
}
