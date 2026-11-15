import { composer as createComposer } from "eslint-flat-config-utils";
import { describe, it } from "vitest";

import type { NamedOptionsConfig, OptionsConfig } from "../src/eslint/index.ts";
import { isentinel } from "../src/eslint/index.ts";
import { isentinel as oxlint } from "../src/oxlint/index.ts";

const composer = createComposer();

describe("isentinel (eslint) signature", () => {
	it("accepts rule overrides, including ones that match the default", () => {
		void isentinel({ rules: { "no-alert": "error" } });
		void isentinel({ typescript: { overrides: { "ts/no-explicit-any": "off" } } });
		void isentinel({}, { rules: { "no-alert": "error" } });
	});

	it("accepts mixed rest arguments", () => {
		void isentinel(
			{},
			{ rules: {} },
			[{ rules: {} }],
			composer,
			Promise.resolve({ rules: {} }),
		);
	});

	it("rejects unknown options", () => {
		// @ts-expect-error - not an option
		void isentinel({ notAnOption: true });
		// @ts-expect-error - not an option, next to a valid one
		void isentinel({ notAnOption: true, roblox: false });
	});

	it("rejects invalid rule entries", () => {
		// @ts-expect-error - not a severity
		void isentinel({ rules: { "no-alert": "nope" } });
		// @ts-expect-error - not a severity
		void isentinel({}, { rules: { "no-alert": "nope" } });
	});

	it("accepts its own parameter type", () => {
		const options: Parameters<typeof isentinel>[0] = {};
		void isentinel(options);
	});
});

describe("isentinel (eslint) named configs", () => {
	it("accepts named items, arrays and composers", () => {
		void isentinel(
			{ name: "project/options", namedConfigs: true },
			{ name: "local/extra", rules: { "no-alert": "off" } },
			[{ name: "local/array", rules: {} }],
			composer,
		);
	});

	it("requires a name on every rest config item", () => {
		void isentinel(
			{ name: "project/options", namedConfigs: true },
			// @ts-expect-error - unnamed config item under namedConfigs: true
			{ rules: { "no-alert": "off" } },
		);
	});

	it("accepts a NamedOptionsConfig value", () => {
		const options: NamedOptionsConfig = { name: "project/options", namedConfigs: true };
		void isentinel(options, { name: "local/extra", rules: {} });
		// @ts-expect-error - unnamed config item under namedConfigs: true
		void isentinel(options, { rules: {} });
	});

	it("does not require names when namedConfigs is false", () => {
		void isentinel({ namedConfigs: false }, { rules: {} });
	});

	it("does not require names when namedConfigs is a widened boolean", () => {
		const options: OptionsConfig = { namedConfigs: Math.random() > 0.5 };
		void isentinel(options, { rules: {} });
	});
});

describe("isentinel (oxlint) signature", () => {
	it("accepts rule overrides, including ones that match the default", () => {
		void oxlint({ name: "x", rules: { "no-alert": "error" } });
		void oxlint();
	});
});
