import type { Rule } from "eslint";

interface Edit {
	range: [number, number];
	text: string;
}

/** Records the edit a fix makes, instead of making it. */
const recordingFixer = {
	replaceTextRange(range: [number, number], text: string): Edit {
		return { range, text };
	},
} as unknown as Rule.RuleFixer;

/**
 * Wrap eslint-plugin-oxfmt so `oxfmt/oxfmt` reports one fix per file.
 *
 * @param plugin - The loaded plugin.
 * @returns The plugin with the wrapped rule.
 */
export function oxfmtSingleFix(plugin: object): object {
	const { rules } = plugin as { rules?: Record<string, Rule.RuleModule> };
	const rule = rules?.["oxfmt"];
	if (rule === undefined) {
		return plugin;
	}

	return { ...plugin, rules: { ...rules, oxfmt: singleFixRule(rule) } };
}

function editOf({ fix }: Rule.ReportDescriptor): Edit | undefined {
	if (typeof fix !== "function") {
		return undefined;
	}

	const edit = fix(recordingFixer) as unknown as Edit | null;
	return edit ?? undefined;
}

/**
 * Merge non-overlapping edits into one that spans them all.
 *
 * @param source - The file text.
 * @param edits - Edits that do not overlap, in any order.
 * @returns One edit with the same effect.
 */
function mergeEdits(source: string, edits: ReadonlyArray<Edit>): Edit {
	const sorted = edits.toSorted((first, second) => first.range[0] - second.range[0]);
	const start = sorted[0]!.range[0];
	let end = start;
	let text = "";
	for (const { range, text: insert } of sorted) {
		text += source.slice(end, range[0]) + insert;
		[, end] = range;
	}

	return { range: [start, end], text };
}

/**
 * Wrap the `oxfmt/oxfmt` rule so one file's formatting is one fix.
 *
 * The rule reports one fix per diff hunk. ESLint skips a fix that overlaps
 * another rule's fix in the same pass but applies the rest, so a delete hunk
 * can be dropped while its insert hunk lands (a moved comment is then kept
 * twice). One fix applies whole or not at all.
 *
 * @param rule - The original rule.
 * @returns The wrapped rule.
 */
function singleFixRule(rule: Rule.RuleModule): Rule.RuleModule {
	return {
		...rule,
		create(context) {
			const reports: Array<Rule.ReportDescriptor> = [];
			const proxy = Object.create(context, {
				report: {
					value: (descriptor: Rule.ReportDescriptor) => {
						reports.push(descriptor);
					},
				},
			}) as Rule.RuleContext;

			function flush(): void {
				const edits = reports.map((descriptor) => editOf(descriptor));
				const fixable = edits.filter((edit): edit is Edit => edit !== undefined);
				const merged =
					fixable.length > 0 ? mergeEdits(context.sourceCode.text, fixable) : undefined;
				let fixAttached = false;
				for (const [index, descriptor] of reports.entries()) {
					const { fix: _fix, ...rest } = descriptor as Rule.ReportDescriptor & {
						fix?: unknown;
					};
					if (merged !== undefined && !fixAttached && edits[index] !== undefined) {
						fixAttached = true;
						context.report({
							...rest,
							fix: (fixer) => fixer.replaceTextRange(merged.range, merged.text),
						} as Rule.ReportDescriptor);
					} else {
						context.report(rest as Rule.ReportDescriptor);
					}
				}

				reports.length = 0;
			}

			const listeners = rule.create(proxy);
			return Object.fromEntries(
				Object.entries(listeners).map(([selector, listener]) => {
					return [
						selector,
						(...args: Array<unknown>) => {
							(listener as (...parameters: Array<unknown>) => void)(...args);
							flush();
						},
					];
				}),
			);
		},
	};
}
