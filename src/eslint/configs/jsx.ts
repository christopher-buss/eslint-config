import { GLOB_JSX, GLOB_TSX } from "../../globs.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export async function jsx(): Promise<Array<TypedFlatConfigItem>> {
	return [
		{
			name: "isentinel/jsx/setup",
			files: [GLOB_JSX, GLOB_TSX],
			languageOptions: {
				parserOptions: {
					ecmaFeatures: {
						jsx: true,
					},
				},
			},
		},
	];
}
