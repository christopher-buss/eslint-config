import { GLOB_SRC } from "../../globs.ts";
import { stylisticRules } from "../../rules/stylistic.ts";
import { interopDefault } from "../../utils.ts";
import type { StylisticConfig, TypedFlatConfigItem } from "../types.ts";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export async function stylistic(
	options: StylisticConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { indent, jsx, quotes, semi } = {
		...StylisticConfigDefaults,
		...options,
	};

	const [pluginStylistic, pluginAntfu] = await Promise.all([
		interopDefault(import("@stylistic/eslint-plugin")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	const config = pluginStylistic.configs.customize({
		indent,
		jsx,
		pluginName: "style",
		quotes,
		semi,
	});

	return [
		{
			name: "isentinel/stylistic/setup",
			plugins: {
				antfu: pluginAntfu,
				style: pluginStylistic,
			},
		},
		{
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: {
				...config.rules,

				...stylisticRules({ indent, jsx, quotes, semi }),
			},
		},
	];
}
