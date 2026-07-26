import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type { OxlintFactoryOptions, RuleCategories } from "../src/oxlint/index.ts";
import { FIXTURES_TEMP } from "./helpers.ts";
import { runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

/**
 * The setting that makes the routing observable: `categories` only ever enables
 * native rules, so an `options.rules` entry that resolved to a jsPlugin instead
 * would leave the native rule here on its defaults.
 */
const ALL_CATEGORIES: RuleCategories = {
	correctness: "error",
	nursery: "error",
	pedantic: "error",
	perf: "error",
	restriction: "error",
	style: "error",
	suspicious: "error",
};

/**
 * A block-scoped function declaration — what `no-inner-declarations` reports.
 */
const PROBE = `export function outer(flag: boolean): void {
	if (flag) {
		function inner(): void {
			print(flag);
		}

		inner();
	}
}
`;

/**
 * Lint the probe with every category on and the given `options.rules`.
 *
 * @param name - A directory name for the run.
 * @param rules - The rules to pass as factory options.
 * @returns The diagnostics.
 */
async function lintProbe(
	name: string,
	rules: OxlintFactoryOptions["rules"],
): Promise<Array<string>> {
	const temporaryDirectory = path.resolve(FIXTURES_TEMP, name);
	await fs.mkdir(path.join(temporaryDirectory, "src"), { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, "src", "probe.ts"), PROBE);

	const config = oxlintIsentinel({
		name: "test/oxlint-native-fallback",
		categories: ALL_CATEGORIES,
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		rules,
		spellCheck: false,
	});

	await fs.writeFile(
		path.join(temporaryDirectory, ".oxlintrc.json"),
		JSON.stringify(config, undefined, "\t"),
	);

	const diagnostics = runOxlint(temporaryDirectory);
	await fs.rm(temporaryDirectory, { force: true, recursive: true });
	return diagnostics;
}

/**
 * Whether oxlint reported the native `no-inner-declarations` rule.
 *
 * @param diagnostics - The diagnostics from a run.
 * @returns Whether the rule fired.
 */
function firedInnerDeclarations(diagnostics: Array<string>): boolean {
	return diagnostics.some((diagnostic) => diagnostic.endsWith("eslint(no-inner-declarations)"));
}

describe("oxlint native rule fallback", () => {
	// `no-inner-declarations` is absent from `oxlintRuleMapping`, and unmapped
	// rules used to fall through to the `eslint-js` jsPlugin: the entry
	// configured `eslint-js/no-inner-declarations` while the native rule the
	// category enabled kept its defaults and fired anyway (#625).
	it(
		"should let options.rules configure an unmapped rule oxlint runs natively",
		async ({ expect }) => {
			expect.assertions(2);

			const categoryOnly = await lintProbe("oxlint-native-fallback-default", {});
			const relaxed = await lintProbe("oxlint-native-fallback-option", {
				"no-inner-declarations": ["error", "functions", { blockScopedFunctions: "allow" }],
			});

			expect(firedInnerDeclarations(categoryOnly)).toBe(true);
			expect(firedInnerDeclarations(relaxed)).toBe(false);
		},
		timeout,
	);
});
