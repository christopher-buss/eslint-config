import process from "node:process";

import packageJson from "../../package.json" with { type: "json" };
import { CliError } from "./lib/cli/types.ts";
import { runLint } from "./lib/run.ts";

const HELP = `isentinel-lint [flags] [paths... | --files0-from <file|->]

Runs oxlint and ESLint together, sizing ESLint's --concurrency from how many
files actually need re-linting and managing per-mode caches.

Flags:
  --eslint                 Run only ESLint.
  --oxlint                 Run only oxlint.
  --fix                    Check as usual, then fix only the files the checks
                           reported, in one further ESLint child.
  --agents, --no-agents    Emit agent-friendly output. On by default when an AI
                           agent session is detected (AI_AGENT, CLAUDECODE, ...).
  --type-aware=off|only|full
                           Force a single ESLint pass. Default runs the fast and
                           type-aware passes concurrently; full is the escape hatch.
  --no-oxlint-type-aware   Skip oxlint's type-aware rules (no tsgolint needed).
  --no-cache               Disable ESLint's cache.
  --concurrency <n|off>    Override the concurrency heuristic.
  --eslint-args "<args>"   Extra arguments for ESLint.
  --oxlint-args "<args>"   Extra arguments for oxlint.
  --files0-from <file|->   Read the paths to lint from a NUL-delimited UTF-8
                           list (- for stdin) instead of positional arguments.
                           An empty list lints nothing and exits 0.
  --print                  Print the composed commands without running them.
  -- <args>                Forward args to the single selected tool.
  -h, --help               Show this help.
  -v, --version            Show the version.
`;

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${HELP}\n`);
		return 0;
	}

	if (argv.includes("--version") || argv.includes("-v")) {
		process.stdout.write(`${packageJson.version}\n`);
		return 0;
	}

	return runLint(argv);
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((err: unknown) => {
		if (err instanceof CliError) {
			console.error(err.message);
		} else {
			console.error(err);
		}

		process.exitCode = 1;
	});
