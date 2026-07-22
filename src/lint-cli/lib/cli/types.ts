/**
 * Which type-aware ESLint cache/builder a pass targets. `"off"` is the
 * syntactic-only fast pass, `"only"` the type-aware pass; the full config
 * (env unset) is represented by `undefined`.
 */
export type TypeAwareMode = "off" | "only";

/**
 * User-selectable `--type-aware` value. `"full"` forces today's single
 * full-config pass (the escape hatch); omitting the flag selects the default
 * concurrent two-pass mode.
 */
export type TypeAwareOption = "full" | "off" | "only";

/**
 * Logical identifier for each linter child the runner drives. `"fast"` and
 * `"typed"` are the two ESLint passes of the default concurrent mode.
 */
export type ToolLabel = "eslint" | "fast" | "oxc" | "typed";

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
	/**
	 * Explicit `--type-aware` selection. `undefined` means the default
	 * concurrent two-pass mode (fast + typed).
	 */
	typeAware: TypeAwareOption | undefined;
}

/** A single linter child process, described independently of the shell. */
export interface ChildCommand {
	/** Logical arguments (paths and flags), excluding the binary itself. */
	args: Array<string>;
	/** Logical binary name, resolved to a real path at spawn time. */
	bin: ToolBin;
	/**
	 * Environment overrides layered on top of `process.env` at spawn time. A
	 * value of `undefined` explicitly REMOVES the variable from the child (Node
	 * drops undefined env entries), so an inherited `ESLINT_TYPE_AWARE` cannot
	 * leak into the full-config pass.
	 */
	env: Record<string, string | undefined>;
	/** Prefix/name used for concurrently output and logging. */
	label: ToolLabel;
}

/**
 * Resolved inputs for composing the ESLint child. The `cacheLocation`,
 * `eslintLabel` and `typeAwareEnv` triple comes from the pass descriptor, so it
 * is set once per pass rather than restated across the mode branches.
 */
export interface ComposeContext {
	/** Absolute path to the agent ESLint formatter (resolved lazily). */
	agentsFormatterPath: string;
	/** ESLint cache file for this pass. */
	cacheLocation: string;
	/** Whether the process is running in CI (`process.env.CI`). */
	ci: boolean;
	/** Concurrency value passed to ESLint's `--concurrency`. */
	concurrency: "off" | number;
	/** Label for the composed ESLint child (`eslint`, `fast` or `typed`). */
	eslintLabel: ToolLabel;
	/** Target paths to lint. */
	paths: Array<string>;
	/**
	 * Value for the ESLint child's `ESLINT_TYPE_AWARE`. `undefined` leaves it
	 * unset (the full config).
	 */
	typeAwareEnv: TypeAwareMode | undefined;
}

/** Resolved inputs for composing the oxlint child. */
export interface OxlintComposeContext {
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
