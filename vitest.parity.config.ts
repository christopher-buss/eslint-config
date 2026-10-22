import { defineConfig } from "vitest/config";

// The formatter parity suite runs the real CLIs over many scratch projects, too
// slow for the pre-commit hook. CI runs it with `nr test:parity`.
export default defineConfig({
	test: {
		include: ["test/parity/**/*.parity.ts"],
		testTimeout: 300_000,
	},
});
