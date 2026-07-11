import { GLOB_EXCLUDE } from "../../globs.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export async function ignores(
	userIgnores: ((originals: Array<string>) => Array<string>) | Array<string> = [],
): Promise<Array<TypedFlatConfigItem>> {
	return [
		{
			name: "isentinel/ignores",
			ignores:
				typeof userIgnores === "function"
					? userIgnores([...GLOB_EXCLUDE])
					: [...GLOB_EXCLUDE, ...userIgnores],
		},
	];
}
