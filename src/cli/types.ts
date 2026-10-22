export type FrameworkOption = "react" | "test";

/**
 * Where formatting runs: inside ESLint, or as oxfmt on its own (see the
 * factory's `formatter` option).
 */
export type FormatterMode = "eslint" | "standalone";

export interface PromItem<T> {
	hint?: string;
	label: string;
	value: T;
}

export interface PromptResult {
	formatter: FormatterMode;
	frameworks: Array<FrameworkOption>;
	uncommittedConfirmed: boolean;
	updateVscodeSettings: boolean;
}
