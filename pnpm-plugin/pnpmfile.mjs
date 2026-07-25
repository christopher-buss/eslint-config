/**
 * The entry point pnpm auto-loads for config dependencies whose name matches
 * its plugin pattern (`pnpm-plugin-`, prefixed by any scope). All of the logic
 * lives in `extensions.mjs` so the repository's own `.pnpmfile.mjs` can share
 * it.
 */
import { applyExtensions } from "./extensions.mjs";

export const hooks = {
	readPackage: applyExtensions,
};
