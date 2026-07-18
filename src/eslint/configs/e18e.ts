import { GLOB_PACKAGE_JSON, GLOB_SRC } from "../../globs.ts";
import { e18eRules } from "../../rules/e18e.ts";
import { interopDefault, resolveNodeMajor } from "../../utils.ts";
import type {
	OptionsE18e,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsProjectType,
	TypedFlatConfigItem,
} from "../types.ts";

export async function e18e({
	files = [GLOB_SRC],
	ignores,
	isInEditor = false,
	modernization = true,
	type = "game",
	moduleReplacements = type === "package" && isInEditor,
	nodeMajor = resolveNodeMajor(),
	overrides = {},
	performanceImprovements = true,
}: OptionsE18e &
	OptionsFiles &
	OptionsIsInEditor &
	OptionsProjectType & {
		ignores?: Array<string>;
		nodeMajor?: number;
	} = {}): Promise<Array<TypedFlatConfigItem>> {
	const [jsoncEslintParser, pluginE18e] = await Promise.all([
		interopDefault(import("jsonc-eslint-parser")),
		interopDefault(import("@e18e/eslint-plugin")),
	]);

	return [
		{
			name: "isentinel/e18e/rules",
			files,
			...(ignores ? { ignores } : {}),
			plugins: {
				e18e: pluginE18e,
			},
			rules: {
				...e18eRules({ modernization, nodeMajor, performanceImprovements }),

				...overrides,
			},
		},

		// `ban-dependencies` only has JSON visitors, so it has to be scoped to
		// the manifest rather than to source files.
		...(moduleReplacements
			? [
					{
						name: "isentinel/e18e/package-json",
						files: [GLOB_PACKAGE_JSON],
						languageOptions: {
							parser: jsoncEslintParser,
						},
						plugins: {
							e18e: pluginE18e,
						},
						rules: {
							"e18e/ban-dependencies": "warn",
						},
					} satisfies TypedFlatConfigItem,
				]
			: []),
	];
}
