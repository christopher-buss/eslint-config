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
}: NodeRuleOptions & OptionsFiles & { ignores?: Array<string> | undefined } = {}): Promise<
	Array<TypedFlatConfigItem>
> {
	await ensurePackages(["eslint-plugin-n"]);

	const pluginNode = lazyPlugin("eslint-plugin-n");
	// `nodeRules` includes Node-only unicorn rules. `lazyPlugin` returns the
	// same object per package, so registering it beside `unicorn()` is safe.
	const pluginUnicorn = lazyPlugin("eslint-plugin-unicorn");

	return [
		{
			name: "isentinel/node/rules",
			files,
			...(ignores ? { ignores } : {}),
			plugins: {
				node: pluginNode,
				unicorn: pluginUnicorn,
			},
			rules: nodeRules({ nodeMajor }),
		},
	];
}
