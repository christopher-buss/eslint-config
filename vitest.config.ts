import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.spec.ts"],
		testTimeout: 120_000,
	},
});
