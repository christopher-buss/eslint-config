import { GLOB_EXCLUDE } from "../globs";
import type { TypedFlatConfigItem } from "../types";

export async function ignores(
	userIgnores: ((originals: Array<string>) => Array<string>) | Array<string> = [],
): Promise<Array<TypedFlatConfigItem>> {
	return [
		{
			ignores:
				typeof userIgnores === "function"
					? userIgnores([...GLOB_EXCLUDE])
					: [...GLOB_EXCLUDE, ...userIgnores],
			name: "isentinel/ignores",
		},
	];
}
