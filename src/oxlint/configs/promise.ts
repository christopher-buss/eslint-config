import { GLOB_SRC } from "../../globs.ts";
import { promiseRules } from "../../rules/promise.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintPromise(): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/promise",
		files: [GLOB_SRC],
		rules: promiseRules(),
	});
}
