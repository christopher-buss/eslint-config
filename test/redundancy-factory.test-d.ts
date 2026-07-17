/* oxlint-disable sonar/no-duplicate-string -- Type-test fixtures repeat literal rule and config names by design. */
import { describe, it } from "vitest";

import { isentinel } from "../src/eslint/index.ts";

describe("redundancyCheck: top-level rules", () => {
	it("flags overrides matching the preset default", () => {
		// @ts-expect-error - 'no-alert' already defaults to "error"
		void isentinel({ rules: { "no-alert": "error" } });
		// @ts-expect-error - numeric severity alias of the default
		void isentinel({ rules: { "no-alert": 2 } });
		// @ts-expect-error - bare severity matching a tuple default's severity
		void isentinel({ rules: { eqeqeq: "error" } });
		// @ts-expect-error - tuple identical to the default
		void isentinel({ rules: { eqeqeq: ["error", "always"] } });
		// @ts-expect-error - re-stating a default "off" is redundant too
		void isentinel({ rules: { "ts/no-explicit-any": "off" } });
	});

	it("allows meaningful overrides", () => {
		void isentinel({ rules: { "no-alert": "off" } });
		void isentinel({ rules: { "no-alert": "warn" } });
		void isentinel({ rules: { eqeqeq: ["error", "smart"] } });
		void isentinel({ rules: { "ts/no-explicit-any": "error" } });
		void isentinel({ rules: { "some/unknown-rule": "error" } });
	});
});

describe("redundancyCheck: variants", () => {
	it("selects defaults for the active type/roblox variant", () => {
		// @ts-expect-error - roblox-only rule is on by default in the default
		// variant
		void isentinel({ rules: { "small-rules/no-array-constructor-elements": "error" } });
		void isentinel({
			roblox: false,
			rules: { "small-rules/no-array-constructor-elements": "error" },
		});
	});

	it("skips variant-specific rules when roblox is not a literal", () => {
		const flag = Math.random() > 0.5;
		void isentinel({
			roblox: flag,
			rules: { "small-rules/no-array-constructor-elements": "error" },
		});
	});
});

describe("redundancyCheck: dropped-options markers", () => {
	it("still flags a bare severity for env-dependent rules (options retained)", () => {
		// @ts-expect-error - severity matches; ESLint keeps the default options
		void isentinel({ rules: { "@cspell/spellchecker": "warn" } });
	});

	it("never flags option tuples for env-dependent rules", () => {
		void isentinel({
			rules: { "comment-length/limit-single-line-comments": ["error", { maxLength: 120 }] },
		});
	});
});

describe("redundancyCheck: opt-out", () => {
	it("disables the check entirely", () => {
		void isentinel({ redundancyCheck: false, rules: { "no-alert": "error" } });
		void isentinel({
			redundancyCheck: false,
			typescript: { overrides: { "ts/no-explicit-any": "off" } },
		});
	});

	it("also disables rest-argument config validation", () => {
		void isentinel({ redundancyCheck: false }, { rules: { "no-alert": "error" } });
	});
});

describe("redundancyCheck: named configs", () => {
	it("flags redundant overrides for namedConfigs callers", () => {
		void isentinel(
			{
				name: "project/options",
				namedConfigs: true,
				// @ts-expect-error - redundant override under namedConfigs
				rules: { "no-alert": "error" },
			},
			{ name: "local/extra", rules: {} },
		);
	});

	it("keeps requiring names on rest configs when namedConfigs is on", () => {
		void isentinel(
			{ name: "project/options", namedConfigs: true },
			// @ts-expect-error - unnamed config item under namedConfigs: true
			{ rules: { "no-alert": "off" } },
		);
		void isentinel(
			{ name: "project/options", namedConfigs: true },
			{ name: "local/extra", rules: { "no-alert": "off" } },
		);
	});
});

describe("redundancyCheck: sub-config overrides", () => {
	it("checks overrides against the matching scope", () => {
		// @ts-expect-error - redundant within typescript.overrides
		void isentinel({ typescript: { overrides: { "ts/no-explicit-any": "off" } } });
		// @ts-expect-error - redundant within the test scope (jest defaults)
		void isentinel({ test: { jest: true, overrides: { "jest/max-expects": "error" } } });
	});

	it("allows meaningful sub-config overrides", () => {
		void isentinel({ typescript: { overrides: { "ts/no-explicit-any": "error" } } });
		void isentinel({ test: { jest: true, overrides: { "jest/max-expects": "off" } } });
	});
});

describe("redundancyCheck: file-scope overrides", () => {
	it("checks jsonc overrides against the jsonc scope", () => {
		// @ts-expect-error - redundant within jsonc.overrides
		void isentinel({ jsonc: { overrides: { "jsonc/no-dupe-keys": "error" } } });
		void isentinel({ jsonc: { overrides: { "jsonc/no-dupe-keys": "off" } } });
	});
});

describe("redundancyCheck: user configs", () => {
	it("checks unscoped rest-argument configs", () => {
		// @ts-expect-error - redundant in an unscoped user config
		void isentinel({}, { rules: { "no-alert": "error" } });
		// @ts-expect-error - redundant inside a config array
		void isentinel({}, [{ rules: { "no-alert": "error" } }]);
	});

	it("allows meaningful and files-scoped user configs", () => {
		void isentinel({}, { rules: { "no-alert": "off" } });
		void isentinel({}, [{ rules: { "no-alert": "off" } }]);
		void isentinel({}, { files: ["**/*.spec.ts"], rules: { "no-alert": "error" } });
	});
});
