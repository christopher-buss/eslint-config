import type { Linter } from "eslint";
import { FlatConfigComposer } from "eslint-flat-config-utils";
import fs from "node:fs";

import {
	comments,
	disables,
	ignores,
	imports,
	jsdoc,
	jsonc,
	markdown,
	perfectionist,
	pnpm,
	prettier,
	promise,
	react,
	roblox,
	shopify,
	sonarjs,
	sortTsconfig,
	stylistic,
	toml,
	typescript,
	unicorn,
	yaml,
} from "./configs";
import { jsx } from "./configs/jsx";
import { packageJson } from "./configs/package-json";
import { spelling } from "./configs/spelling";
import { test } from "./configs/test";
import type { Awaitable, ConfigNames, OptionsConfig, TypedFlatConfigItem } from "./types";
import { getOverrides, interopDefault, isInEditorEnvironment, resolveSubOptions } from "./utils";

const flatConfigProps: Array<keyof TypedFlatConfigItem> = [
	"name",
	"files",
	"ignores",
	"languageOptions",
	"linterOptions",
	"processor",
	"plugins",
	"rules",
	"settings",
];

export const defaultPluginRenaming = {
	"@eslint-react": "react",
	"@eslint-react/hooks-extra": "react-hooks-extra",
	"@eslint-react/naming-convention": "react-naming-convention",
	"@stylistic": "style",
	"@typescript-eslint": "ts",
	"yml": "yaml",
};

/**
 * Generates an array of user configuration items based on the provided options
 * and user configs.
 *
 * @param options - The options for generating the user configuration items.
 * @param userConfigs - Additional user configuration items.
 * @returns A promise that resolves to an array of user configuration items.
 */
export function isentinel(
	options: OptionsConfig & TypedFlatConfigItem = {},
	...userConfigs: Array<
		Awaitable<
			| Array<Linter.Config>
			| Array<TypedFlatConfigItem>
			| FlatConfigComposer<any, any>
			| TypedFlatConfigItem
		>
	>
): FlatConfigComposer<TypedFlatConfigItem, ConfigNames> {
	const {
		autoRenamePlugins = true,
		componentExts: componentExtensions = [],
		formatters,
		gitignore: enableGitignore = true,
		jsx: enableJsx = true,
		pnpm: enableCatalogs = false,
		react: enableReact = false,
		roblox: enableRoblox = true,
		spellCheck: enableSpellCheck,
		typescript: enableTypeScript,
	} = options;

	let isInEditor = options.isInEditor;
	if (isInEditor === undefined) {
		isInEditor = isInEditorEnvironment();
		if (isInEditor) {
			console.log(
				"[@isentinel/eslint-config] Detected running in editor, some rules are disabled.",
			);
		}
	}

	const stylisticOptions = (() => {
		if (options.stylistic === false) {
			return false;
		}

		if (typeof options.stylistic === "object") {
			return options.stylistic;
		}

		return {};
	})();

	if (stylisticOptions && !("jsx" in stylisticOptions)) {
		stylisticOptions.jsx = enableJsx;
	}

	const configs: Array<Awaitable<Array<TypedFlatConfigItem>>> = [];

	/* eslint-disable arrow-style/arrow-return-style -- Bug with line length. */
	if (enableGitignore) {
		if (typeof enableGitignore !== "boolean") {
			configs.push(
				interopDefault(import("eslint-config-flat-gitignore")).then((resolved) => [
					resolved(enableGitignore),
				]),
			);
		} else if (fs.existsSync(".gitignore")) {
			configs.push(
				interopDefault(import("eslint-config-flat-gitignore")).then((resolved) => [
					resolved(),
				]),
			);
		} else {
			throw new Error(
				"gitignore option is enabled but no .gitignore file was found in the current directory",
			);
		}
	}
	/* eslint-enable arrow-style/arrow-return-style -- Bug with line length. */

	// Base configs
	configs.push(
		comments({ stylistic: stylisticOptions }),
		ignores(),
		imports({ stylistic: stylisticOptions, type: options.type }),
		jsdoc({ stylistic: stylisticOptions, type: options.type }),
		packageJson({ roblox: options.roblox, type: options.type }),
		promise(),
		shopify({ stylistic: stylisticOptions }),
		sonarjs({ isInEditor }),
		typescript({
			...resolveSubOptions(options, "typescript"),
			componentExts: componentExtensions,
			isInEditor,
			overrides: getOverrides(options, "typescript"),
			stylistic: stylisticOptions,
		}),
		unicorn({ stylistic: stylisticOptions }),
	);

	if (enableJsx) {
		configs.push(jsx());
	}

	if (enableRoblox) {
		configs.push(
			roblox(
				{
					...resolveSubOptions(options, "typescript"),
					componentExts: componentExtensions,
					stylistic: stylisticOptions,
				},
				formatters === undefined && formatters !== false,
			),
		);
	}

	if (stylisticOptions) {
		configs.push(
			stylistic(stylisticOptions),
			perfectionist({ ...resolveSubOptions(options, "perfectionist"), type: options.type }),
		);
	}

	if (options.test ?? false) {
		configs.push(
			test({
				isInEditor,
				overrides: getOverrides(options, "test"),
			}),
		);
	}

	if (enableReact) {
		configs.push(
			react({
				...resolveSubOptions(options, "react"),
				overrides: getOverrides(options, "react"),
				tsconfigPath: getOverrides(options, "typescript").tsconfigPath,
			}),
		);
	}

	if (enableSpellCheck ?? true) {
		configs.push(
			spelling({
				...resolveSubOptions(options, "spellCheck"),
				componentExts: componentExtensions,
				isInEditor,
			}),
		);
	}

	if (options.jsonc ?? true) {
		configs.push(
			jsonc({
				overrides: getOverrides(options, "jsonc"),
				stylistic: stylisticOptions,
			}),
		);

		if (stylisticOptions) {
			configs.push(sortTsconfig());
		}
	}

	if (enableCatalogs) {
		configs.push(pnpm());
	}

	if (options.yaml ?? true) {
		configs.push(
			yaml({
				overrides: getOverrides(options, "yaml"),
				stylistic: stylisticOptions,
			}),
		);
	}

	if (options.toml ?? true) {
		configs.push(
			toml({
				overrides: getOverrides(options, "toml"),
				stylistic: stylisticOptions,
			}),
		);
	}

	if (options.markdown ?? true) {
		configs.push(
			markdown({
				componentExts: componentExtensions,
				overrides: getOverrides(options, "markdown"),
				type: options.type,
			}),
		);
	}

	configs.push(disables());

	if (stylisticOptions) {
		// We require prettier to be the last config
		configs.push(
			prettier({
				...(typeof enableTypeScript !== "boolean" ? enableTypeScript : {}),
				componentExts: componentExtensions,
				formatters: formatters !== false ? formatters : undefined,
				overrides: getOverrides(options, "typescript"),
				prettierOptions:
					typeof options["formatters"] === "boolean"
						? ({} as any)
						: options["formatters"]?.prettierOptions || {},
				stylistic: typeof stylisticOptions === "boolean" ? {} : stylisticOptions,
			}),
		);
	}

	if ("files" in options) {
		throw new Error(
			'[@isentinel/eslint-config] The first argument should not contain the "files" property as the options are supposed to be global. Place it in the second or later config instead.',
		);
	}

	// User can optionally pass a flat config item to the first argument
	// We pick the known keys as ESLint would do schema validation
	const fusedConfig = flatConfigProps.reduce((accumulator, key) => {
		if (key in options) {
			accumulator[key] = options[key] as any;
		}

		return accumulator;
	}, {} as TypedFlatConfigItem);
	if (Object.keys(fusedConfig).length) {
		configs.push([fusedConfig]);
	}

	let composer = new FlatConfigComposer<TypedFlatConfigItem, ConfigNames>();

	composer = composer.append(...configs, ...(userConfigs as any));

	if (autoRenamePlugins) {
		composer = composer.renamePlugins(defaultPluginRenaming);
	}

	if (isInEditor) {
		composer = composer.disableRulesFix(
			["no-useless-return", "prefer-const", "unicorn/no-array-for-each"],
			{
				builtinRules: async () => {
					const rules = await import("eslint/use-at-your-own-risk");
					return rules.builtinRules;
				},
			},
		);
	}

	return composer;
}
