import { describe, it } from "vitest";

import { isentinel } from "../src/oxlint/index.ts";

describe("oxlint redundancyCheck: top-level rules", () => {
	it("flags overrides matching the preset default", () => {
		// @ts-expect-error - 'no-alert' already defaults to "error"
		void isentinel({ name: "x", rules: { "no-alert": "error" } });
		void isentinel({
			name: "x",
			// @ts-expect-error - tuple identical to the default
			rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
		});
	});

	it("does not flag a bare severity over an options-tuple default", () => {
		// Oxlint replaces entries wholesale, so this override drops the
		// default's options and is meaningful.
		void isentinel({ name: "x", rules: { "no-console": "error" } });
	});

	it("allows meaningful overrides", () => {
		void isentinel({ name: "x", rules: { "no-alert": "off" } });
		void isentinel({ name: "x", rules: { "no-console": ["error", { allow: ["warn"] }] } });
		void isentinel({ name: "x", rules: { "some/unknown-rule": "error" } });
	});
});

describe("oxlint redundancyCheck: variants", () => {
	it("selects defaults for the active type/roblox variant", () => {
		void isentinel({
			name: "x",
			// @ts-expect-error - roblox-only rule is on by default in the
			// default variant
			rules: { "cease-nonsense/no-array-constructor-elements": "error" },
		});
		void isentinel({
			name: "x",
			roblox: false,
			rules: { "cease-nonsense/no-array-constructor-elements": "error" },
		});
	});
});

describe("oxlint redundancyCheck: opt-out", () => {
	it("disables the check entirely", () => {
		void isentinel({ name: "x", redundancyCheck: false, rules: { "no-alert": "error" } });
	});
});

describe("oxlint redundancyCheck: sub-config and fragments", () => {
	it("checks the test scope", () => {
		void isentinel({
			name: "x",
			// @ts-expect-error - redundant within the test scope (vitest
			// defaults)
			test: { overrides: { "vitest/max-expects": "error" }, vitest: true },
		});
		void isentinel({
			name: "x",
			test: { overrides: { "vitest/max-expects": "off" }, vitest: true },
		});
	});

	it("skips rest-argument fragments, which are always files-scoped", () => {
		// Oxlint fragments require `files`, so glob scoping puts them outside
		// what the type-level check can reason about.
		void isentinel(
			{ name: "x" },
			{ name: "local/scoped", files: ["**/*.spec.ts"], rules: { "no-alert": "error" } },
		);
	});
});
