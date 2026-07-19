/** Which type-aware linting mode ESLint should run in. */
export type TypeAwareMode = "off" | "only";

/** Logical identifier for each linter the runner drives. */
export type ToolLabel = "eslint" | "oxc";

/** Logical binary name resolved from the consumer's `node_modules`. */
export type ToolBin = "eslint" | "oxlint";

/**
 * Fully parsed and validated `isentinel-lint` invocation. All ambiguity has
 * been resolved by `parseArguments` before this shape is produced.
 */
export interface LintCliOptions {
	/** Emit agent-friendly output for both linters. */
	agents: boolean;
	/** Whether ESLint should use its on-disk cache. */
	cache: boolean;
	/** Explicit `--concurrency` override; bypasses the heuristic when set. */
	concurrency: "off" | number | undefined;
	/** Run only ESLint. */
	eslint: boolean;
	/** Extra arguments forwarded verbatim to ESLint. */
	eslintArgs: Array<string>;
	/** Apply fixes: `oxlint --fix` then `eslint --fix`, sequentially. */
	fix: boolean;
	/** Whether to pass `--type-aware` to oxlint. */
	oxlint: boolean;
	/** Extra arguments forwarded verbatim to oxlint. */
	oxlintArgs: Array<string>;
	/** When false, omit `--type-aware` from the oxlint invocation. */
	oxlintTypeAware: boolean;
	/** Target paths to lint. Defaults to `["."]`. */
	paths: Array<string>;
	/** Print the composed command lines instead of running them. */
	print: boolean;
	/** ESLint type-aware mode; sets `ESLINT_TYPE_AWARE` for the child. */
	typeAware: TypeAwareMode | undefined;
}

/** A single linter child process, described independently of the shell. */
export interface ChildCommand {
	/** Logical arguments (paths and flags), excluding the binary itself. */
	args: Array<string>;
	/** Logical binary name, resolved to a real path at spawn time. */
	bin: ToolBin;
	/** Extra environment variables layered on top of `process.env`. */
	env: Record<string, string>;
	/** Prefix/name used for concurrently output and logging. */
	label: ToolLabel;
}

/** Resolved inputs shared by both command composers. */
export interface ComposeContext {
	/** Absolute path to the agent ESLint formatter (resolved lazily). */
	agentsFormatterPath: string;
	/** ESLint cache file for the active type-aware mode. */
	cacheLocation: string;
	/** Whether the process is running in CI (`process.env.CI`). */
	ci: boolean;
	/** Concurrency value passed to ESLint's `--concurrency`. */
	concurrency: "off" | number;
	/** Whether oxlint should receive `--type-aware`. */
	oxlintTypeAware: boolean;
	/** Target paths to lint. */
	paths: Array<string>;
}

/**
 * User-facing error. When thrown from the runner the message is printed
 * without a stack trace and the process exits non-zero.
 */
export class CliError extends Error {
	public override name = "CliError";
}
