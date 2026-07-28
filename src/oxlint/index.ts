import { buildOxlintRuleMapping } from "./routing.ts";
import type { OxlintTarget } from "./routing.ts";

export * from "./factory.ts";
export { isentinel as default } from "./factory.ts";
export {
	isPresetRuleOxlintCovered as isOxlintCovered,
	oxlintJsPlugins,
	staysInEslint,
	translateRuleToOxlint,
} from "./routing.ts";
export type { OxlintTarget } from "./routing.ts";

/**
 * Where each rule the preset enables runs when linting with Oxlint.
 *
 * Built here rather than in the resolver so importing the ESLint factory does
 * not pay for resolving every preset rule; only consumers of this entry point
 * do.
 */
export const oxlintRuleMapping: Readonly<Record<string, OxlintTarget>> = buildOxlintRuleMapping();
export type * from "./types.ts";
// Registering a jsPlugin by bare specifier breaks under pnpm's isolated
// node_modules, and a `{ name }` that does not match the rule prefix silently
// loses the rules, so consumers writing their own `jsPlugins` entry need this.
export { resolveJsPluginSpecifier } from "./utils.ts";
