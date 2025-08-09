import { GLOB_EXCLUDE } from "../globs";
import type { TypedFlatConfigItem } from "../types";

export async function ignores(
	userIgnores: Array<string> = [],
): Promise<Array<TypedFlatConfigItem>> {
	return [
		{
			ignores: [...GLOB_EXCLUDE, ...userIgnores],
			name: "isentinel/ignores",
		},
	];
}
