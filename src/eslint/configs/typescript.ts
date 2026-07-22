import { GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import {
	erasableSyntaxOnlyRules,
	typescriptRules,
	typescriptTypeAwareRules,
} from "../../rules/typescript.ts";
import {
	createTsParser,
	ensurePackages,
	getTsConfig,
	interopDefault,
	renameRules,
} from "../../utils.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsHasRoblox,
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptErasableOnly,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";

export async function typescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsHasRoblox &
		OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes & {
			/**
			 * When set, re-apply the non-roblox type-aware rules to every
			 * type-aware file except these globs (the roblox scope), so the
			 * complement is linted as standard-TS/Node land.
			 */
			complementIgnores?: Array<string>;
		} = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		complementIgnores,
		componentExts: componentExtensions = [],
		erasableOnly = false,
		outOfProjectFiles,
		overrides = {},
		overridesTypeAware = {},
		parserOptions = {},
		parserOptionsNonTypeAware = {},
		parserOptionsTypeAware = {},
		roblox = true,
		stylistic = true,
		typeAware = true,
	} = options;

	const files = options.files ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const filesTypeAware = options.filesTypeAware ?? [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const typeAwareRules: TypedFlatConfigItem["rules"] = typescriptTypeAwareRules({ roblox });

	const [parserTs, pluginTs, pluginAntfu] = await Promise.all([
		interopDefault(import("@typescript-eslint/parser")),
		interopDefault(import("@typescript-eslint/eslint-plugin")),
		interopDefault(import("eslint-plugin-antfu")),
	] as const);

	const erasablePlugin = await (async () => {
		if (!erasableOnly) {
			return;
		}

		await ensurePackages(["eslint-plugin-erasable-syntax-only"]);
		return interopDefault(import("eslint-plugin-erasable-syntax-only"));
	})();

	function makeParser(
		usesTypeInformation: boolean,
		parserFiles: Array<Array<string> | string>,
		ignores?: Array<string>,
	): TypedFlatConfigItem {
		return createTsParser({
			componentExtensions,
			configName: "typescript",
			files: parserFiles,
			ignores,
			outOfProjectFiles,
			parser: parserTs,
			parserOptions,
			parserOptionsNonTypeAware,
			parserOptionsTypeAware,
			tsconfigPath,
			typeAware: usesTypeInformation,
		});
	}

	return [
		{
			// Install the plugins without globs, so they can be configured
			// separately.
			name: "isentinel/typescript/setup",
			plugins: {
				antfu: pluginAntfu,
				ts: pluginTs,
			},
		},
		// assign type-aware parser for type-aware files and type-unaware parser
		// for the rest
		...(isTypeAware
			? [makeParser(false, files), makeParser(true, filesTypeAware, ignoresTypeAware)]
			: [makeParser(false, files)]),
		{
			name: "isentinel/typescript/rules",
			files,
			rules: {
				...renameRules(
					pluginTs.configs["eslint-recommended"]?.overrides?.[0]?.rules ?? {},
					{
						"@typescript-eslint": "ts",
					},
				),
				...renameRules(pluginTs.configs["strict"]?.rules ?? {}, {
					"@typescript-eslint": "ts",
				}),

				...typescriptRules({ stylistic }),

				...overrides,
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/typescript/rules-type-aware",
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),
		// The complement re-applies the non-roblox type-aware rules last, so it
		// wins for files outside the roblox scope. `overridesTypeAware` is
		// re-spread so user overrides still beat it.
		...(isTypeAware && complementIgnores
			? [
					{
						name: "isentinel/typescript/rules-type-aware/complement",
						files: filesTypeAware,
						ignores: [...ignoresTypeAware, ...complementIgnores],
						rules: {
							...typescriptTypeAwareRules({ roblox: false }),
							...overridesTypeAware,
						},
					},
				]
			: []),

		...(erasableOnly
			? [
					{
						name: "isentinel/typescript/erasable-syntax-only",
						plugins: {
							"erasable-syntax-only": erasablePlugin,
						},
						rules: erasableSyntaxOnlyRules(),
					},
				]
			: []),
	];
}
