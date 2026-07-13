import { GLOB_SRC } from "../../globs.ts";
import { nodeRules } from "../../rules/node.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintNode(): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/node",
		files: [GLOB_SRC],
		rules: nodeRules(),
	});
}
