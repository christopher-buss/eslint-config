import yargs from "yargs";

import { splitArgs } from "./command.ts";
import { parseBoundedInteger } from "./parse.ts";
import type { LintCliOptions } from "./types.ts";
import { CliError } from "./types.ts";

interface ExtractResult {
	rest: Array<string>;
	value: string | undefined;
}

/**
 * Parse and validate an `isentinel-lint` argv slice (without the node/bin
 * prefix). Throws {@link CliError} on any invalid combination.
 *
 * @param argv - The argument slice to parse.
 * @returns The parsed and validated options.
 */
export function parseArguments(argv: Array<string>): LintCliOptions {
	// Everything after a bare `--` is verbatim passthrough; never scan it for
	// the per-tool arg options.
	const separator = argv.indexOf("--");
	const head = separator === -1 ? argv : argv.slice(0, separator);
	const tail = separator === -1 ? [] : argv.slice(separator);

	const eslintExtract = extractValueOption(head, "eslint-args");
	const oxlintExtract = extractValueOption(eslintExtract.rest, "oxlint-args");

	const parsed = yargs([...oxlintExtract.rest, ...tail])
		.scriptName("isentinel-lint")
		.parserConfiguration({ "boolean-negation": true, "populate--": true })
		.option("eslint", { description: "Run only ESLint.", type: "boolean" })
		.option("oxlint", { description: "Run only oxlint.", type: "boolean" })
		.option("fix", { description: "Apply fixes (oxlint then ESLint).", type: "boolean" })
		.option("agents", { description: "Agent-friendly output.", type: "boolean" })
		.option("print", { description: "Print the composed commands.", type: "boolean" })
		.option("cache", {
			default: true,
			description: "Use ESLint's on-disk cache.",
			type: "boolean",
		})
		.option("oxlint-type-aware", {
			default: true,
			description: "Pass --type-aware to oxlint.",
			type: "boolean",
		})
		.option("type-aware", {
			choices: ["off", "only", "full"] as const,
			description: "ESLint type-aware mode.",
			type: "string",
		})
		.option("concurrency", {
			description: "ESLint concurrency override (<n> or off).",
			type: "string",
		})
		.conflicts("eslint", "oxlint")
		.strictOptions()
		.exitProcess(false)
		.fail((message: string | undefined, error: Error | undefined) => {
			throw new CliError(message ?? error?.message ?? "Invalid arguments.");
		})
		.parseSync();

	const eslintOnly = parsed.eslint === true;
	const oxlintOnly = parsed.oxlint === true;
	const { typeAware } = parsed;
	const fix = parsed.fix === true;

	if (fix && typeAware !== undefined) {
		throw new CliError(
			"Cannot combine --fix with --type-aware; --fix always uses the full config.",
		);
	}

	const eslintArgs = eslintExtract.value !== undefined ? splitArgs(eslintExtract.value) : [];
	const oxlintArgs = oxlintExtract.value !== undefined ? splitArgs(oxlintExtract.value) : [];

	const rawPassthrough = parsed["--"];
	const passthrough = Array.isArray(rawPassthrough) ? rawPassthrough.map(String) : [];
	if (passthrough.length > 0) {
		if (eslintOnly === oxlintOnly) {
			throw new CliError(
				"`--` passthrough requires a single tool; use it with --eslint or --oxlint.",
			);
		}

		if (eslintOnly) {
			eslintArgs.push(...passthrough);
		} else {
			oxlintArgs.push(...passthrough);
		}
	}

	const paths = parsed._.map(String).filter((value) => value.length > 0);

	return {
		agents: parsed.agents === true,
		cache: parsed.cache,
		concurrency: parseConcurrency(parsed.concurrency),
		eslint: eslintOnly,
		eslintArgs,
		fix,
		oxlint: oxlintOnly,
		oxlintArgs,
		oxlintTypeAware: parsed.oxlintTypeAware,
		paths: paths.length > 0 ? paths : ["."],
		print: parsed.print === true,
		typeAware,
	};
}

/**
 * Pull a single `--name <value>` / `--name=<value>` option out of an argv
 * slice. Done before yargs because yargs refuses dash-prefixed values (for
 * example `--eslint-args "--max-warnings 0"`).
 *
 * @param argv - The argument slice to scan.
 * @param name - The option name (without leading dashes).
 * @returns The extracted value and the remaining arguments.
 */
function extractValueOption(argv: Array<string>, name: string): ExtractResult {
	const flag = `--${name}`;
	const inline = `${flag}=`;
	const rest: Array<string> = [];
	let value: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === undefined) {
			continue;
		}

		if (token === flag) {
			const next = argv[index + 1];
			if (next === undefined) {
				throw new CliError(`Option ${flag} requires a value.`);
			}

			value = next;
			index += 1;
			continue;
		}

		if (token.startsWith(inline)) {
			value = token.slice(inline.length);
			continue;
		}

		rest.push(token);
	}

	return { rest, value };
}

function parseConcurrency(value: string | undefined): "off" | number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === "off") {
		return "off";
	}

	const parsed = parseBoundedInteger(value, 1);
	if (parsed === undefined) {
		throw new CliError(
			`Invalid --concurrency "${value}"; expected a positive integer or "off".`,
		);
	}

	return parsed;
}
