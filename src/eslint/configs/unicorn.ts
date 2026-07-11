import { GLOB_ROOT, GLOB_SRC } from "../../globs.ts";
import { unicornRootRules, unicornRules } from "../../rules/unicorn.ts";
import { interopDefault, mergeGlobs, toSourceGlob } from "../../utils.ts";
import type {
	OptionsHasRoblox,
	OptionsStylistic,
	OptionsUnicorn,
	TypedFlatConfigItem,
} from "../types.ts";

export async function unicorn({
	nameReplacements,
	roblox = true,
	root: customRootGlobs,
	stylistic = true,
}: OptionsHasRoblox & OptionsStylistic & OptionsUnicorn & { root?: Array<string> } = {}): Promise<
	Array<TypedFlatConfigItem>
> {
	const pluginUnicorn = await interopDefault(import("eslint-plugin-unicorn"));

	const rootGlobs = mergeGlobs(GLOB_ROOT.map(toSourceGlob), customRootGlobs?.map(toSourceGlob));

	return [
		{
			name: "isentinel/unicorn/setup",
			plugins: {
				unicorn: pluginUnicorn,
			},
		},
		{
			name: "isentinel/unicorn/rules",
			files: [GLOB_SRC],
			rules: unicornRules({ nameReplacements, roblox, stylistic }),
		},
		{
			name: "isentinel/unicorn/root",
			files: rootGlobs,
			rules: unicornRootRules({ nameReplacements, roblox }),
		},
	];
}
