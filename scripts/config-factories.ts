import {
	comments,
	e18e,
	eslintPlugin,
	flawless,
	gitignore,
	ignores,
	imports,
	javascript,
	jsdoc,
	jsonc,
	markdown,
	naming,
	node,
	oxfmt,
	packageJson,
	perfectionist,
	pnpm,
	promise,
	react,
	roblox,
	smallRules,
	sonarjs,
	spelling,
	stylistic,
	test,
	toml,
	typescript,
	unicorn,
	yaml,
} from "../src/index.ts";
import type { Awaitable, TypedFlatConfigItem } from "../src/types.ts";

/**
 * Every config module, with every optional feature turned on, in the order the
 * factory composes them.
 *
 * The generators enumerate the modules rather than a hand-written package list
 * so a newly registered plugin cannot escape them. Sharing one list keeps that
 * promise: a module added here reaches both the rule-type generator and the
 * type-aware snapshot generator. Added to only one of two lists, it would have
 * silently sent its plugin back through the runtime scan that the lazy
 * registration exists to avoid.
 *
 * Composed at module scope, not behind thunks: each generator consumes it once,
 * immediately, and a thunk per entry buys nothing.
 */
export const PRESET_CONFIGS: Array<Awaitable<Array<TypedFlatConfigItem>>> = [
	comments(),
	e18e(),
	eslintPlugin(),
	flawless(),
	gitignore(),
	ignores(),
	imports(),
	javascript(),
	jsdoc(),
	jsonc(),
	markdown(),
	naming(),
	node(),
	oxfmt(),
	packageJson(),
	perfectionist(),
	pnpm({ isInEditor: false }),
	promise(),
	react(),
	roblox(),
	smallRules(),
	sonarjs({ isInEditor: false }),
	spelling(),
	stylistic(),
	test({ jest: true, vitest: true }),
	toml(),
	typescript({ erasableOnly: true }),
	unicorn(),
	yaml(),
];
