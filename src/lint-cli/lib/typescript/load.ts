import { createRequire } from "node:module";
import path from "node:path";
import type * as TypeScript from "typescript";

import { isRecord } from "../../../guards.ts";

/**
 * Resolve the consumer's `typescript` and load it lazily. Anchored at `cwd` so
 * resolution walks the consumer's `node_modules` (typescript is a peer of
 * typescript-eslint, never a dependency of this package). Using `createRequire`
 * rather than a static import keeps typescript out of the bundle and off the
 * load path unless a caller actually needs it.
 *
 * @param cwd - The consumer project root to resolve from.
 * @returns The TypeScript module, or `undefined` when it cannot be resolved.
 */
export function loadTypescript(cwd: string): typeof TypeScript | undefined {
	try {
		const require = createRequire(path.join(cwd, "__isentinel-lint__.js"));
		const required: unknown = require("typescript");
		return isTypeScriptModule(required) ? required : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Whether a required module is the TypeScript compiler API this module returns.
 *
 * @param value - The required module's exports.
 * @returns Whether the exports expose the TypeScript compiler API.
 */
function isTypeScriptModule(value: unknown): value is typeof TypeScript {
	return isRecord(value) && typeof value["createProgram"] === "function";
}
