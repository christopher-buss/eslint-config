interface FormatOptions {
	readonly suffix: string;
}

export function format(input: string, prefix?: string, options?: FormatOptions): string {
	return `${prefix ?? ""}${input}${options?.suffix ?? ""}`;
}
