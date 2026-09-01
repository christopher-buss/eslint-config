import {
	folderStructureRules,
	PROJECT_STRUCTURE_FILES,
	PROJECT_STRUCTURE_IGNORES,
} from "../../rules/project-structure.ts";
import { ensurePackages } from "../../utils.ts";
import type { ProjectStructureConfig, TypedFlatConfigItem } from "../types.ts";

export async function projectStructure({
	enforceExistence,
	files = PROJECT_STRUCTURE_FILES,
	ignores = PROJECT_STRUCTURE_IGNORES,
	overrides = {},
	projectRoot,
	structureRoot,
}: ProjectStructureConfig = {}): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-project-structure"]);

	const { projectStructurePlugin } = await import("eslint-plugin-project-structure");

	return [
		{
			name: "isentinel/project-structure/setup",
			plugins: {
				"project-structure": projectStructurePlugin,
			},
		},
		{
			name: "isentinel/project-structure/rules",
			files,
			ignores,
			rules: {
				...folderStructureRules({ enforceExistence, projectRoot, structureRoot }),

				...overrides,
			},
		},
	];
}
