import type { ProjectStructureConfig } from "../../eslint/types.ts";
import {
	folderStructureRules,
	PROJECT_STRUCTURE_FILES,
	PROJECT_STRUCTURE_IGNORES,
} from "../../rules/project-structure.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

/**
 * Co-location rules for standalone oxlint.
 *
 * `folder-structure` runs as a jsPlugin: it visits `Program` once per file and
 * answers from the filesystem, so oxlint needs no type information to run it.
 *
 * @param options - The templates to enforce, and the roots they resolve
 *   against.
 * @returns The generated config fragments.
 */
export function oxlintProjectStructure({
	enforceExistence,
	files = PROJECT_STRUCTURE_FILES,
	ignores = PROJECT_STRUCTURE_IGNORES,
	overrides = {},
	projectRoot,
	structureRoot,
}: ProjectStructureConfig = {}): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/project-structure",
		excludeFiles: ignores,
		files: files.flat(),
		overrides,
		rules: folderStructureRules({ enforceExistence, projectRoot, structureRoot }),
	});
}
