import { GLOB_SRC } from "../../globs.ts";
import { nodeRules } from "../../rules/node.ts";
import type { NodeRuleOptions } from "../../rules/node.ts";
import { ensurePackages, resolveNodeMajor } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type { OptionsFiles, TypedFlatConfigItem } from "../types.ts";

export async function node({
	files = [GLOB_SRC],
	ignores,
	nodeMajor = resolveNodeMajor(),
}: NodeRuleOptions & OptionsFiles & { ignores?: Array<string> } = {}): Promise<
	Array<TypedFlatConfigItem>
> {
	await ensurePackages(["eslint-plugin-n"]);

	const pluginNode = lazyPlugin("eslint-plugin-n");

	return [
		{
			name: "isentinel/node/rules",
			files,
			...(ignores ? { ignores } : {}),
			plugins: {
				node: pluginNode,
			},
			rules: nodeRules({ nodeMajor }),
		},
	];
}
