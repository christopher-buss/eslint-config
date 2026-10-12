import process from "node:process";
import yargs from "yargs";

import { isInAgentSession } from "../../../utils.ts";
import { parseBoundedInteger } from "./parse.ts";
import { splitArgs } from "./split-args.ts";
import type { LintCliOptions } from "./types.ts";
import { CliError } from "./types.ts";

interface ExtractResult {
	/** How many times the option appeared. */
	occurrences: number;
	rest: Array<string>;
	value: string | undefined;
}

/**
 * The ESLint flags that make it lint source text read from its own stdin. The
 * engine's stdin carries its argument list (see `bootstrap.ts`), so these can
 * never work through the runner and are refused rather than silently linting
 * empty input.
 */
const STDIN_SOURCE_FLAGS = ["--stdin", "--stdin-filename"];

/**
 * Parse and validate an `isentinel-lint` argv slice (without the node/bin
 * prefix). Throws {@link CliError} on any invalid combination.
 *
 * `--agents` is tri-state: absent it follows {@link isInAgentSession}, so an
 * agent gets agent-shaped output without passing the flag and `--no-agents`
 * forces it back off.
 *
 * @param argv - The argument slice to parse.
 * @param environment - The process environment (defaults to `process.env`).
 * @returns The parsed and validated options.
 */
export function parseArguments(
	argv: Array<string>,
	environment: NodeJS.ProcessEnv = process.env,
): LintCliOptions {
	// Everything after a bare `--` is verbatim passthrough; never scan it for
	// the per-tool arg options.
	const separator = argv.indexOf("--");
	const head = separator === -1 ? argv : argv.slice(0, separator);
	const tail = separator === -1 ? [] : argv.slice(separator);

	const eslintExtract = extractValueOption(head, "eslint-args");
	const oxlintExtract = extractValueOption(eslintExtract.rest, "oxlint-args");
	const filesExtract = extractValueOption(oxlintExtract.rest, "files0-from");
	if (filesExtract.occurrences > 1) {
		throw new CliError("Option --files0-from may only be given once.");
	}

	const filesFrom = filesExtract.value;
	if (filesFrom?.length === 0) {
		throw new CliError("Option --files0-from requires a path, or - for stdin.");
	}

	const parsed = yargs([...filesExtract.rest, ...tail])
		.scriptName("isentinel-lint")
		.parserConfiguration({ "boolean-negation": true, "populate--": true })
		.option("eslint", { description: "Run only ESLint.", type: "boolean" })
		.option("oxlint", { description: "Run only oxlint.", type: "boolean" })
		.option("fix", {
			description: "Fix the files the checks reported.",
			type: "boolean",
		})
		.option("agents", {
			description: "Agent-friendly output (default: on in an agent session).",
			type: "boolean",
		})
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
			"Cannot combine --fix with --type-aware; the fix child always uses the full config.",
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

	const stdinFlag = eslintArgs.find(isStdinSourceFlag);
	if (stdinFlag !== undefined) {
		throw new CliError(
			`Cannot forward ${stdinFlag} to ESLint: isentinel-lint lints files, not source ` +
				"text on stdin. Run ESLint directly to lint stdin.",
		);
	}

	const paths = parsed._.map(String).filter((value) => value.length > 0);
	if (filesFrom !== undefined && paths.length > 0) {
		throw new CliError(
			"Cannot combine --files0-from with positional paths; put every path in the list.",
		);
	}

	return {
		agents: parsed.agents ?? isInAgentSession(environment),
		cache: parsed.cache,
		concurrency: parseConcurrency(parsed.concurrency),
		eslint: eslintOnly,
		eslintArgs,
		filesFrom,
		fix,
		oxlint: oxlintOnly,
		oxlintArgs,
		oxlintTypeAware: parsed.oxlintTypeAware,
		// A file list supplies the paths once it is read (see `readFileList`);
		// it must never fall back to the whole-tree default.
		paths: filesFrom !== undefined || paths.length > 0 ? paths : ["."],
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
	let occurrences = 0;

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
			occurrences += 1;
			index += 1;
			continue;
		}

		if (token.startsWith(inline)) {
			value = token.slice(inline.length);
			occurrences += 1;
			continue;
		}

		rest.push(token);
	}

	return { occurrences, rest, value };
}

function isStdinSourceFlag(token: string): boolean {
	return STDIN_SOURCE_FLAGS.some((flag) => token === flag || token.startsWith(`${flag}=`));
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
