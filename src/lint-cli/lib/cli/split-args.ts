/**
 * Split a raw argument string into tokens, honouring single and double quotes
 * so values such as `--rule "no-console: error"` survive as one argument.
 *
 * @param input - The raw argument string to split.
 * @returns The parsed argument tokens.
 */
export function splitArgs(input: string): Array<string> {
	const tokens: Array<string> = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let hasToken = false;

	for (const char of input) {
		if (quote !== undefined) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}

			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			hasToken = true;
			continue;
		}

		if (char === " " || char === "\t" || char === "\n") {
			if (hasToken) {
				tokens.push(current);
				current = "";
				hasToken = false;
			}

			continue;
		}

		current += char;
		hasToken = true;
	}

	if (hasToken) {
		tokens.push(current);
	}

	return tokens;
}
