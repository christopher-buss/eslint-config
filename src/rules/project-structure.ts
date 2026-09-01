import process from "node:process";

import type { ProjectStructureConfig } from "../eslint/types.ts";
import {
	GLOB_BUILD_CONFIGS,
	GLOB_DTS,
	GLOB_SRC,
	GLOB_SRC_EXTENSIONS,
	GLOB_TESTS,
} from "../globs.ts";
import type { TypedFlatConfigItem } from "../types.ts";

/** Stands for the extension of the file a rule matched. */
const EXTENSION_TOKEN = "{ext}";

const DEFAULT_ENFORCE_EXISTENCE = [`{node-name}.spec.${EXTENSION_TOKEN}`];

/** Reusable-rule id for "a folder of any name". */
const ANY_FOLDER = "isentinelAnyFolder";

/** The files the co-location check runs on, before `ignores`. */
export const PROJECT_STRUCTURE_FILES: Array<string> = [GLOB_SRC];

/** The files the co-location check skips. */
export const PROJECT_STRUCTURE_IGNORES: Array<string> = [
	...GLOB_TESTS,
	GLOB_DTS,
	...GLOB_BUILD_CONFIGS,
];

/** One node in the `folder-structure` tree. */
interface StructureRule {
	name?: string;
	children?: Array<StructureRule>;
	enforceExistence?: Array<string>;
	ruleId?: string;
}

/**
 * Co-location rules shared between the ESLint and oxlint factories.
 *
 * `folder-structure` is not type-aware and runs unchanged as an oxlint
 * jsPlugin, so both engines have to hand it the same options or they disagree
 * about which files are co-located.
 *
 * @param options - The templates to enforce, and the roots they resolve
 *   against.
 * @returns The rule map.
 */
export function folderStructureRules({
	enforceExistence = DEFAULT_ENFORCE_EXISTENCE,
	projectRoot = process.cwd(),
	structureRoot,
}: Pick<
	ProjectStructureConfig,
	"enforceExistence" | "projectRoot" | "structureRoot"
> = {}): TypedFlatConfigItem["rules"] {
	const templates = typeof enforceExistence === "string" ? [enforceExistence] : enforceExistence;
	const children = buildChildren(templates);

	return {
		"project-structure/folder-structure": [
			"error",
			{
				// Path-length warnings go to `console.error`, escaping every
				// report format and every disable comment.
				longPathsInfo: false,
				// Load-bearing. The plugin otherwise derives its root from its
				// own install path; under pnpm's global virtual store that
				// lands in the store, and every file is skipped without a word.
				projectRoot,
				rules: { [ANY_FOLDER]: { name: "*", children } },
				structure: children,
				...(structureRoot === undefined ? {} : { structureRoot }),
			},
		],
	};
}

/**
 * The rules matching the files inside one folder, in the order
 * `folder-structure` tries them - first match wins.
 *
 * Every entry is permissive: `structure` is required by the rule and an
 * unmatched node is an error, so anything less would turn the co-location
 * check into whole-tree naming enforcement.
 *
 * @param templates - The `enforceExistence` templates, before substitution.
 * @returns The child rules, ending in the recursive folder rule.
 */
function buildChildren(templates: Array<string>): Array<StructureRule> {
	// A file already matching a template is exempt from it, so `foo.spec.ts` is
	// not asked for a `foo.spec.spec.ts`. A rule matches one path segment, so
	// the exemption is keyed on the template's basename and applies in every
	// folder - `specs/{node-name}.{ext}` has to exempt the file it lands on
	// wherever `folder-structure` reaches it.
	const children: Array<StructureRule> = templates.map((template) => {
		return {
			name: (template.split("/").pop() ?? template).replaceAll(/\{[^{}]*\}/g, "*"),
		};
	});

	for (const extension of GLOB_SRC_EXTENSIONS) {
		children.push({
			name: `*.${extension}`,
			enforceExistence: templates.map((template) => {
				return template.replaceAll(EXTENSION_TOKEN, () => extension);
			}),
		});
	}

	children.push({ ruleId: ANY_FOLDER });

	return children;
}
