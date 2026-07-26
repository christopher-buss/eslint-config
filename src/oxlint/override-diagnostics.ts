/**
 * Why a user-supplied `overrides` entry could not be delivered to oxlint.
 *
 * - `eslint-only`: the rule cannot run in oxlint at all (see
 *   `excludedFromOxlint`), so the ESLint side keeps it.
 * - `missing-plugin`: the rule needs a jsPlugin the consumer has not installed.
 * - `native-only`: `jsPlugins: false` dropped the plugin that owns the rule.
 */
export type DroppedOverrideReason = "eslint-only" | "missing-plugin" | "native-only";

export interface DroppedOverride {
	reason: DroppedOverrideReason;
	rule: string;
}

const REASON_TEXT: Readonly<Record<DroppedOverrideReason, string>> = {
	"eslint-only": "oxlint cannot run this rule; it stays in ESLint",
	"missing-plugin": "the plugin that owns it is not installed",
	"native-only": "it needs a jsPlugin, and `jsPlugins: false` is set",
};

/**
 * Override diagnostics for the config build in progress: the entries that never
 * reached the generated config, and the oxlint names of the ones that did.
 *
 * The splitter runs deep inside the config modules, which return config
 * fragments and have no channel for diagnostics — and an override can be
 * dropped without leaving a fragment behind at all. The factory drains both
 * buffers per build, which is safe because it builds synchronously from start
 * to finish.
 */
const droppedOverrides: Array<DroppedOverride> = [];
const overrideRules = new Set<string>();

/**
 * Record an override that never reached the generated config.
 *
 * @param entry - The dropped override and the reason it was dropped.
 */
export function recordDroppedOverride(entry: DroppedOverride): void {
	droppedOverrides.push(entry);
}

/**
 * Record the oxlint names of overrides that made it into a fragment, so a later
 * pass that deletes rules (native-only mode) can tell a user's entry from the
 * preset's.
 *
 * @param rules - The oxlint rule names.
 */
export function recordOverrideRules(rules: Iterable<string>): void {
	for (const rule of rules) {
		overrideRules.add(rule);
	}
}

/**
 * Take everything recorded since the last call, emptying both buffers.
 *
 * @returns The dropped overrides (deduplicated by rule and reason) and the
 *   oxlint names of the overrides that were emitted.
 */
export function takeOverrideDiagnostics(): {
	dropped: Array<DroppedOverride>;
	emitted: ReadonlySet<string>;
} {
	const taken = droppedOverrides.splice(0);
	const emitted = new Set(overrideRules);
	overrideRules.clear();

	const seen = new Set<string>();
	const dropped = taken.filter(({ reason, rule }) => {
		const key = `${rule} ${reason}`;
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});

	return { dropped, emitted };
}

/**
 * Warn about `overrides` entries that could not be applied. An override is a
 * deliberate instruction, so a silently discarded one leaves a rule reporting
 * (or not reporting) with no way to tell why.
 *
 * @param entries - What was dropped, and why; an empty list warns nothing.
 */
export function warnDroppedOverrides(entries: Array<DroppedOverride>): void {
	if (entries.length === 0) {
		return;
	}

	const lines = entries.map(({ reason, rule }) => `  - "${rule}": ${REASON_TEXT[reason]}`);
	// oxlint-disable-next-line no-console -- Info for plugin
	console.warn(
		"[@isentinel/eslint-config] These `overrides` entries could not be " +
			`applied to oxlint:\n${lines.join("\n")}`,
	);
}
