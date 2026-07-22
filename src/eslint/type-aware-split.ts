import { GLOB_ALL_JSON, GLOB_LUA, GLOB_MARKDOWN, GLOB_TOML, GLOB_YAML } from "../globs.ts";
import { isRecord } from "../guards.ts";
import { optionallyTypeAwareRules, typeAwareJsPluginRules } from "../rules/oxlint-mapping.ts";
import type { TypedFlatConfigItem } from "./types.ts";

/**
 * Rules that need type information but do not declare
 * `meta.docs.requiresTypeChecking` and are configured outside the type-aware
 * config blocks, so neither classification signal catches them.
 */
const FUNCTIONALLY_TYPE_AWARE_RULES: ReadonlySet<string> = new Set([
	...typeAwareJsPluginRules,
	...optionallyTypeAwareRules,
	"flawless/prefer-read-only-props",
]);

/** The type-aware split mode; see the factory's `typeAware` option. */
export type TypeAwareSplitMode = "only" | false;

/**
 * Collect the names of every type-aware rule referenced by the resolved
 * configs.
 *
 * @param configs - The resolved flat config items.
 * @returns The type-aware rule names.
 */
export function collectTypeAwareRules(configs: Array<TypedFlatConfigItem>): Set<string> {
	const registry = collectRuleRegistry(configs);
	const typeAware = new Set<string>();

	for (const config of configs) {
		collectFromConfig(config, registry, typeAware);
	}

	return typeAware;
}

/**
 * Partition the resolved configs by type-awareness for multi-pass linting.
 *
 * Classification is per RULE, not per config item: a rule is type-aware when
 * its `meta.docs.requiresTypeChecking` is `true`, when it is in the manual
 * functionally-type-aware list, or when it is enabled in a config item whose
 * name contains `type-aware` (which covers `overridesTypeAware` and custom
 * type-aware rules without the meta flag). Every entry of a rule (enabled and
 * `"off"`) follows its classification, so paired base-rule disables inside the
 * type-aware blocks (for example `dot-notation: "off"` next to
 * `ts/dot-notation`) stay with the non-type-aware pass and effective
 * severities are preserved exactly.
 *
 * In `false` mode the type-aware parser configs (the ones enabling
 * `projectService`) are removed as well, so no TypeScript program is ever
 * built. Both modes disable `reportUnusedDisableDirectives`: a directive for a
 * rule that runs in the other pass would otherwise be reported as unused. Only
 * the full config reports unused directives.
 *
 * @param configs - The resolved flat config items (mutated in place).
 * @param mode - `false` drops every type-aware rule; `"only"` keeps only
 *   type-aware rules.
 * @param extraTypeAwareRules - Additional rules to classify as type-aware (the
 *   factory's `typeAwareRules` option).
 */
export function applyTypeAwareSplit(
	configs: Array<TypedFlatConfigItem>,
	mode: TypeAwareSplitMode,
	extraTypeAwareRules: Array<string> = [],
): void {
	const typeAwareRules = collectTypeAwareRules(configs);
	for (const rule of extraTypeAwareRules) {
		typeAwareRules.add(rule);
	}

	for (let index = configs.length - 1; index >= 0; index -= 1) {
		const config = configs[index];
		if (config === undefined) {
			continue;
		}

		if (mode === false && isTypeAwareParserConfig(config)) {
			configs.splice(index, 1);
			continue;
		}

		filterConfigRules(config, typeAwareRules, mode);
	}

	if (mode === "only") {
		// The non-JS/TS-language config modules are not composed in "only"
		// mode, but a rules config (for example a user block scoping rules
		// "off" for JSON or YAML files) can still pull those files into the
		// run, where the default JS parser fails on them. Ignore them
		// globally; the non-type-aware pass lints them.
		configs.push({
			name: "isentinel/type-aware-split/ignores",
			ignores: [GLOB_ALL_JSON, GLOB_LUA, GLOB_MARKDOWN, GLOB_TOML, GLOB_YAML],
		});
	}

	configs.push({
		name: "isentinel/type-aware-split/disables",
		linterOptions: {
			reportUnusedDisableDirectives: "off",
		},
	});
}

/**
 * Record the type-aware rules of a single config item.
 *
 * @param config - The flat config item to scan.
 * @param registry - Rule id to rule definition.
 * @param typeAware - The type-aware rule names (mutated).
 */
function collectFromConfig(
	config: TypedFlatConfigItem,
	registry: Map<string, boolean>,
	typeAware: Set<string>,
): void {
	const inTypeAwareConfig = config.name?.includes("type-aware") ?? false;
	const entries = Object.entries(config.rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined) {
			continue;
		}

		if (FUNCTIONALLY_TYPE_AWARE_RULES.has(rule) || registry.get(rule) === true) {
			typeAware.add(rule);
			continue;
		}

		const severity = Array.isArray(value) ? value[0] : value;
		if (inTypeAwareConfig && severity !== "off" && severity !== 0) {
			typeAware.add(rule);
		}
	}
}

/**
 * Whether a plugin rule definition declares `meta.docs.requiresTypeChecking`,
 * validating each hop since the plugin object crosses an untyped boundary.
 *
 * @param rule - The rule definition read off a plugin's `rules` record.
 * @returns Whether the rule requires type information.
 */
function requiresTypeChecking(rule: unknown): boolean {
	if (!isRecord(rule)) {
		return false;
	}

	const { meta } = rule;
	if (!isRecord(meta)) {
		return false;
	}

	const { docs } = meta;
	return isRecord(docs) && docs["requiresTypeChecking"] === true;
}

/**
 * Build a registry of rule definitions from the plugins registered on the
 * resolved configs, keyed by the (renamed) `prefix/name` rule id.
 *
 * @param configs - The resolved flat config items.
 * @returns Rule id to rule definition.
 */
function collectRuleRegistry(configs: Array<TypedFlatConfigItem>): Map<string, boolean> {
	const registry = new Map<string, boolean>();

	for (const config of configs) {
		const plugins = Object.entries(config.plugins ?? {});
		for (const [prefix, plugin] of plugins) {
			const rules = isRecord(plugin) ? plugin["rules"] : undefined;
			if (isRecord(rules)) {
				for (const [name, rule] of Object.entries(rules)) {
					registry.set(`${prefix}/${name}`, requiresTypeChecking(rule));
				}
			}
		}
	}

	return registry;
}

/**
 * Delete the rule entries of a config item that belong to the other pass.
 *
 * @param config - The flat config item (mutated).
 * @param typeAwareRules - The type-aware rule names.
 * @param mode - The split mode being applied.
 */
function filterConfigRules(
	{ rules }: TypedFlatConfigItem,
	typeAwareRules: Set<string>,
	mode: TypeAwareSplitMode,
): void {
	if (rules === undefined) {
		return;
	}

	for (const rule of Object.keys(rules)) {
		const isTypeAware = typeAwareRules.has(rule);
		if (mode === false ? isTypeAware : !isTypeAware) {
			delete rules[rule];
		}
	}
}

/**
 * Whether a config item is a preset type-aware parser config (the one that
 * enables `projectService`, which builds a TypeScript program).
 *
 * @param config - The flat config item.
 * @returns Whether the config is a type-aware parser config.
 */
function isTypeAwareParserConfig(config: TypedFlatConfigItem): boolean {
	if (config.name === undefined || !config.name.includes("type-aware")) {
		return false;
	}

	const parserOptions = config.languageOptions?.["parserOptions"];
	const projectService = isRecord(parserOptions) ? parserOptions["projectService"] : undefined;
	return projectService !== undefined && projectService !== false;
}
