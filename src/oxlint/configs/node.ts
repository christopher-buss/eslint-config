import { GLOB_SRC } from "../../globs.ts";
import type { Rules, TypedOxlintConfigItem } from "../types.ts";

export function oxlintNode(): Array<TypedOxlintConfigItem> {
	// Inlined from nodeRules(), with unsupported rules omitted.
	//
	// TODO(oxlint): not yet implemented
	// handle-callback-err, no-deprecated-api, prefer-global/buffer,
	// prefer-global/process, prefer-node-protocol, process-exit-as-throw

	const rules: Rules = {
		"node/no-exports-assign": "error",
		"node/no-new-require": "error",
		"node/no-path-concat": "error",
	};

	return [
		{
			name: "isentinel/node",
			files: [GLOB_SRC],
			plugins: ["node"],
			rules,
		},
	];
}
