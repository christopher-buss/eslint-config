import type { Rule } from "eslint";

/** As `GLOB_MARKDOWN`, case-sensitive. */
const MARKDOWN_FILE = /\.md$/;

/**
 * Wrap eslint-plugin-oxfmt so `oxfmt/oxfmt` formats Markdown code blocks.
 *
 * The rule skips every virtual file, so a code block is formatted only by
 * the formatter of the file it is in. Oxfmt formats Markdown code blocks at
 * the prose width, so the preset turns that off and lets the rule format each
 * block with the options of its own language. Virtual files of other
 * processors (Vue blocks, say) stay skipped: oxfmt formats those files whole.
 *
 * @param plugin - The loaded plugin.
 * @returns The plugin with the wrapped rule.
 */
export function oxfmtMarkdownCode(plugin: object): object {
	const { rules } = plugin as { rules?: Record<string, Rule.RuleModule> };
	const rule = rules?.["oxfmt"];
	if (rule === undefined) {
		return plugin;
	}

	return { ...plugin, rules: { ...rules, oxfmt: markdownCodeRule(rule) } };
}

/**
 * Whether a file is a code block of a Markdown file.
 *
 * @param context - The rule context.
 * @returns Whether the file is a Markdown code block.
 */
function isMarkdownCodeBlock({ filename, physicalFilename }: Rule.RuleContext): boolean {
	return filename !== physicalFilename && MARKDOWN_FILE.test(physicalFilename);
}

function markdownCodeRule(rule: Rule.RuleModule): Rule.RuleModule {
	return {
		...rule,
		create(context) {
			if (!isMarkdownCodeBlock(context)) {
				return rule.create(context);
			}

			// The rule takes a virtual file for a real one when the two names
			// are the same.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.create returns any; the proxy inherits every context member.
			const proxy = Object.create(context, {
				physicalFilename: { value: context.filename },
			}) as Rule.RuleContext;
			return rule.create(proxy);
		},
	};
}
