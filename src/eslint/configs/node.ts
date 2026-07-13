import { nodeRules } from "../../rules/node.ts";
import { ensurePackages, interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export async function node(): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-n"]);

	const pluginNode = await interopDefault(import("eslint-plugin-n"));

	return [
		{
			name: "isentinel/node/rules",
			plugins: {
				node: pluginNode,
			},
			rules: nodeRules(),
		},
	];
}
