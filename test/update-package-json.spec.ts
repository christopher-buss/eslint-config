import { describe, expect, it, vi } from "vitest";

import type { ConfirmOverwrite } from "../src/cli/stages/update-package-json.ts";
import { LINT_SCRIPTS, mergeLintScripts } from "../src/cli/stages/update-package-json.ts";

describe("mergeLintScripts", () => {
	it("adds both lint scripts when absent", async () => {
		expect.assertions(3);

		const scripts: Record<string, string> = {};

		const result = await mergeLintScripts(scripts, { skipPrompt: false });

		expect(scripts).toStrictEqual(LINT_SCRIPTS);
		expect(result.added).toStrictEqual(["lint", "lint:fix"]);
		expect(result.overwritten).toStrictEqual([]);
	});

	it("adds only the missing script alongside unrelated scripts", async () => {
		expect.assertions(2);

		const scripts: Record<string, string> = { build: "tsc" };

		const result = await mergeLintScripts(scripts, { skipPrompt: false });

		expect(scripts).toStrictEqual({
			"build": "tsc",
			"lint": "isentinel-lint",
			"lint:fix": "isentinel-lint --fix",
		});
		expect(result.added).toStrictEqual(["lint", "lint:fix"]);
	});

	it("leaves identical existing scripts untouched without prompting", async () => {
		expect.assertions(4);

		const scripts: Record<string, string> = { ...LINT_SCRIPTS };
		const confirmOverwrite = vi.fn<ConfirmOverwrite>();

		const result = await mergeLintScripts(scripts, {
			confirmOverwrite,
			skipPrompt: false,
		});

		expect(scripts).toStrictEqual(LINT_SCRIPTS);
		expect(result.added).toStrictEqual([]);
		expect(result.overwritten).toStrictEqual([]);
		expect(confirmOverwrite).not.toHaveBeenCalled();
	});

	it("preserves differing scripts in skip-prompt mode and never prompts", async () => {
		expect.assertions(4);

		const scripts: Record<string, string> = {
			"lint": "eslint",
			"lint:fix": "eslint --fix",
		};
		const confirmOverwrite = vi.fn<ConfirmOverwrite>();

		const result = await mergeLintScripts(scripts, {
			confirmOverwrite,
			skipPrompt: true,
		});

		expect(scripts).toStrictEqual({ "lint": "eslint", "lint:fix": "eslint --fix" });
		expect(result.added).toStrictEqual([]);
		expect(result.overwritten).toStrictEqual([]);
		expect(confirmOverwrite).not.toHaveBeenCalled();
	});

	it("adds missing scripts but preserves differing ones in skip-prompt mode", async () => {
		expect.assertions(3);

		const scripts: Record<string, string> = { lint: "eslint" };

		const result = await mergeLintScripts(scripts, { skipPrompt: true });

		expect(scripts).toStrictEqual({ "lint": "eslint", "lint:fix": "isentinel-lint --fix" });
		expect(result.added).toStrictEqual(["lint:fix"]);
		expect(result.overwritten).toStrictEqual([]);
	});

	it("overwrites a differing script when the user confirms", async () => {
		expect.assertions(3);

		const scripts: Record<string, string> = { "lint": "eslint", "lint:fix": "eslint --fix" };
		const confirmOverwrite = vi.fn<ConfirmOverwrite>().mockResolvedValue(true);

		const result = await mergeLintScripts(scripts, {
			confirmOverwrite,
			skipPrompt: false,
		});

		expect(scripts).toStrictEqual(LINT_SCRIPTS);
		expect(result.overwritten).toStrictEqual(["lint", "lint:fix"]);
		expect(confirmOverwrite).toHaveBeenCalledTimes(2);
	});

	it("keeps a differing script when the user declines", async () => {
		expect.assertions(4);

		const scripts: Record<string, string> = { lint: "eslint" };
		const confirmOverwrite = vi.fn<ConfirmOverwrite>().mockResolvedValue(false);

		const result = await mergeLintScripts(scripts, {
			confirmOverwrite,
			skipPrompt: false,
		});

		expect(scripts).toStrictEqual({ "lint": "eslint", "lint:fix": "isentinel-lint --fix" });
		expect(result.overwritten).toStrictEqual([]);
		expect(result.added).toStrictEqual(["lint:fix"]);
		expect(confirmOverwrite).toHaveBeenCalledOnce();
	});
});
