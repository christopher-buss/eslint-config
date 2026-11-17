interface RunOptions {
	readonly retries?: number;
}

export function run(input: string, isVerbose = false, options: RunOptions = {}): string {
	return `${input} ${String(isVerbose)} ${String(options.retries)}`;
}
