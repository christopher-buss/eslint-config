import process from "node:process";
import { defineConfig } from "vitest/config";

// pnpm 12 sets NODE_PATH to this repo's node_modules for scripts. Node reads it
// once at startup, so remove it before the forked workers start: the lint CLI
// tests expect a temp directory to resolve no packages.
delete process.env["NODE_PATH"];

// A git hook run from a linked worktree exports these, which would point the
// git commands that tests run in temp repos at this repository instead.
for (const key of [
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_DIR",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_PREFIX",
	"GIT_WORK_TREE",
]) {
	delete process.env[key];
}

export default defineConfig({
	test: {
		// The lint CLI tests start real runs. Keep them off the machine budget
		// that other tools on this machine share, so no test waits for a lease.
		env: { MACHINE_BUDGET: "off" },
		include: ["test/**/*.spec.ts"],
		testTimeout: 120_000,
		typecheck: {
			enabled: true,
			include: ["test/**/*.spec-d.ts"],
		},
	},
});
