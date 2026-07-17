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
		void isentinel({ rules: { "cease-nonsense/no-array-constructor-elements": "error" } });
		void isentinel({
			roblox: false,
			rules: { "cease-nonsense/no-array-constructor-elements": "error" },
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

describe("redundancyCheck: user configs", () => {
	it("checks unscoped rest-argument configs", () => {
		// @ts-expect-error - redundant in an unscoped user config
		void isentinel({}, { rules: { "no-alert": "error" } });
	});

	it("allows meaningful and files-scoped user configs", () => {
		void isentinel({}, { rules: { "no-alert": "off" } });
		void isentinel({}, { files: ["**/*.spec.ts"], rules: { "no-alert": "error" } });
	});
});
