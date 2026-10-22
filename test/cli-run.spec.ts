import { multiselect, select } from "@clack/prompts";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it, vi } from "vitest";

import { run } from "../src/cli/run.ts";
import { updateEslintFiles } from "../src/cli/stages/update-eslint-files.ts";

// The typed `import()` form rejects mocks of the generic prompts
// (`multiselect` resolves `Value[]`), so this one mock uses the path form.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- see above.
vi.mock("@clack/prompts", async (importOriginal) => {
	const original = await importOriginal<typeof import("@clack/prompts")>();
	return {
		...original,
		confirm: vi.fn<typeof original.confirm>(async () => true),
		log: {
			...original.log,
			success: vi.fn<typeof original.log.success>(),
			warn: vi.fn<typeof original.log.warn>(),
		},
		multiselect: vi.fn<typeof original.multiselect>(),
		outro: vi.fn<typeof original.outro>(),
		select: vi.fn<typeof original.select>(),
	};
});
vi.mock(import("../src/cli/utils.ts"), async (importOriginal) => {
	return { ...(await importOriginal()), isGitClean: () => true };
});
vi.mock(import("../src/cli/stages/update-eslint-files.ts"), () => {
	return { updateEslintFiles: vi.fn<() => Promise<void>>() };
});
vi.mock(import("../src/cli/stages/update-package-json.ts"), () => {
	return { updatePackageJson: vi.fn<() => Promise<void>>() };
});
vi.mock(import("../src/cli/stages/update-vscode-settings.ts"), () => {
	return { updateVscodeSettings: vi.fn<() => Promise<void>>() };
});

describe("run", () => {
	it("uses the formatter and framework answers", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-run-"));
		vi.spyOn(process, "cwd").mockReturnValue(directory);
		onTestFinished(() => {
			vi.restoreAllMocks();
			fs.rmSync(directory, { force: true, recursive: true });
		});

		vi.mocked(multiselect).mockResolvedValue(["react"]);
		vi.mocked(select).mockResolvedValue("standalone");
		await run();

		expect(vi.mocked(updateEslintFiles)).toHaveBeenCalledWith({
			formatter: "standalone",
			frameworks: ["react"],
			uncommittedConfirmed: true,
			updateVscodeSettings: true,
		});
	});
});
