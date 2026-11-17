import { GLOB_SRC } from "../../globs.ts";
import { nodeRules } from "../../rules/node.ts";
import type { NodeRuleOptions } from "../../rules/node.ts";
import type { OptionsFiles } from "../../types.ts";
import { resolveNodeMajor } from "../../utils.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintNode(
	options: NodeRuleOptions & OptionsFiles & { excludeFiles?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const files = options.files?.flat() ?? [GLOB_SRC];
	const nodeMajor = options.nodeMajor ?? resolveNodeMajor();

	return createOxlintConfigs({
		name: "isentinel/node",
		...(options.excludeFiles ? { excludeFiles: options.excludeFiles } : {}),
		files,
		rules: nodeRules({ nodeMajor }),
	});
}
