export {
	isOxlintCovered,
	oxlintJsPlugins,
	oxlintRuleMapping,
	staysInEslint,
	translateRuleToOxlint,
} from "../rules/oxlint-mapping.ts";
export type { OxlintTarget } from "../rules/oxlint-mapping.ts";
export * from "./factory.ts";
export { isentinel as default } from "./factory.ts";
export type * from "./types.ts";
// Registering a jsPlugin by bare specifier breaks under pnpm's isolated
// node_modules, and a `{ name }` that does not match the rule prefix silently
// loses the rules, so consumers writing their own `jsPlugins` entry need this.
export { resolveJsPluginSpecifier } from "./utils.ts";
