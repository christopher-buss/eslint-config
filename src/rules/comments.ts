import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export interface CommentLengthRuleOptions {
	maxLength: number;
	/** Directive comments treated as semantic (never wrapped). */
	semanticComments?: Array<string>;
	tabSize: number;
}

/**
 * Comment style rules shared between the ESLint and oxlint factories.
 *
 * The directive-comment rules themselves differ per linter
 * (`eslint-comments/*` vs `oxlint-comments/*`) and live in the respective
 * config modules.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function commentsRules({
	stylistic = true,
}: OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		...(stylistic !== false
			? {
					"no-inline-comments": "error",
					"style/multiline-comment-style": ["error", "separate-lines"],
				}
			: {}),
	};
}

/**
 * Comment length rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function commentLengthRules({
	maxLength,
	semanticComments,
	tabSize,
}: CommentLengthRuleOptions): TypedFlatConfigItem["rules"] {
	return {
		"comment-length/limit-single-line-comments": [
			"error",
			{
				maxLength,
				...(semanticComments ? { semanticComments } : {}),
				tabSize,
			},
		],
	};
}
