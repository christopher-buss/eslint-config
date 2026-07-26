import { defaultPluginRenaming } from "../src/eslint/plugin-renaming.ts";
import { requiresTypeChecking } from "../src/eslint/type-aware-split.ts";
import { isRecord } from "../src/guards.ts";
import type { TypedFlatConfigItem } from "../src/types.ts";
import { combine, renamePluginInConfigs } from "../src/utils.ts";
import { PRESET_CONFIGS } from "./config-factories.ts";

export interface TypeAwareScan {
	/** Every plugin prefix the preset registers, renamed, sorted. */
	prefixes: Array<string>;
	/** The `prefix/rule` ids that declare `requiresTypeChecking`, sorted. */
	ruleIds: Array<string>;
}

/**
 * Scan the installed plugins for the prefixes the preset registers them under
 * and the rule ids that declare `meta.docs.requiresTypeChecking`.
 *
 * Renaming is applied because a module that registers `@typescript-eslint`
 * would otherwise be keyed under a prefix no resolved rule id ever uses. The
 * predicate is imported from the runtime rather than restated, so the snapshot
 * and the runtime fallback cannot disagree about what "type-aware" means.
 *
 * @returns The live prefixes and type-aware rule ids.
 */
export async function scanTypeAwareRules(): Promise<TypeAwareScan> {
	const configs = renamePluginInConfigs(await combine(...PRESET_CONFIGS), defaultPluginRenaming);

	const prefixes = new Set<string>();
	const ruleIds = new Set<string>();

	for (const config of configs) {
		collectFromConfig(config, prefixes, ruleIds);
	}

	return { prefixes: [...prefixes].sort(), ruleIds: [...ruleIds].sort() };
}

/**
 * Record the plugin prefixes and type-aware rule ids of a single config item.
 *
 * @param config - The flat config item to scan.
 * @param prefixes - The plugin prefixes (mutated).
 * @param ruleIds - The type-aware rule ids (mutated).
 */
function collectFromConfig(
	config: TypedFlatConfigItem,
	prefixes: Set<string>,
	ruleIds: Set<string>,
): void {
	const plugins = Object.entries(config.plugins ?? {});
	for (const [prefix, plugin] of plugins) {
		prefixes.add(prefix);

		const rules = isRecord(plugin) ? plugin["rules"] : undefined;
		if (isRecord(rules)) {
			for (const [name, rule] of Object.entries(rules)) {
				if (requiresTypeChecking(rule)) {
					ruleIds.add(`${prefix}/${name}`);
				}
			}
		}
	}
}
