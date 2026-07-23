import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.spec.ts"],
		testTimeout: 120_000,
		typecheck: {
			enabled: true,
			include: ["test/**/*.spec-d.ts"],
		},
	},
});
