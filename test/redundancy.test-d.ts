/* oxlint-disable sonar/no-duplicate-string, max-lines-per-function -- Type-test fixtures repeat literal rule names and group many one-line assertions per describe by design. */
import { describe, expectTypeOf, it } from "vitest";

import type {
	IsRedundantEntry,
	RedundantRuleError,
	ValidateRulesAgainst,
	VariantKeyOf,
} from "../src/redundancy.ts";

interface MiniDefaults {
	"dot-notation": { "*": ["error", { allowKeywords: true }] };
	"eqeqeq": { "*": "error" };
	"jsdoc/require-description": {
		game_roblox: "off";
		game_std: "off";
		package_roblox: "error";
		package_std: "error";
	};
	"max-depth": { "*": "off" };
	"no-console": { "*": ["error", { allow: ["warn", "error"] }] };
}

describe("IsRedundantEntry", () => {
	it("flags matching bare severities, including numeric aliases", () => {
		expectTypeOf<IsRedundantEntry<"error", "error">>().toEqualTypeOf<true>();
		expectTypeOf<IsRedundantEntry<2, "error">>().toEqualTypeOf<true>();
		expectTypeOf<IsRedundantEntry<["error"], "error">>().toEqualTypeOf<true>();
	});

	it("flags a bare severity matching a tuple default's severity", () => {
		expectTypeOf<
			IsRedundantEntry<"error", ["error", { allowKeywords: true }]>
		>().toEqualTypeOf<true>();
	});

	it("flags a tuple identical to the default", () => {
		expectTypeOf<
			IsRedundantEntry<["error", { allowKeywords: true }], ["error", { allowKeywords: true }]>
		>().toEqualTypeOf<true>();
		expectTypeOf<
			IsRedundantEntry<
				readonly ["error", { readonly allowKeywords: true }],
				["error", { allowKeywords: true }]
			>
		>().toEqualTypeOf<true>();
	});

	it("allows different severities", () => {
		expectTypeOf<IsRedundantEntry<"off", "error">>().toEqualTypeOf<false>();
		expectTypeOf<IsRedundantEntry<"warn", "error">>().toEqualTypeOf<false>();
		expectTypeOf<IsRedundantEntry<"error", "off">>().toEqualTypeOf<false>();
	});

	it("allows tuples whose options differ from the default", () => {
		expectTypeOf<
			IsRedundantEntry<
				["error", { allowKeywords: false }],
				["error", { allowKeywords: true }]
			>
		>().toEqualTypeOf<false>();
		expectTypeOf<
			IsRedundantEntry<
				["error", { allow: ["warn"] }],
				["error", { allow: ["warn", "error"] }]
			>
		>().toEqualTypeOf<false>();
	});

	it("allows a tuple with options when the default is severity-only", () => {
		expectTypeOf<IsRedundantEntry<["warn", { size: 1 }], "warn">>().toEqualTypeOf<false>();
	});

	it("allows non-literal entries", () => {
		expectTypeOf<IsRedundantEntry<"error" | "off", "error">>().toEqualTypeOf<false>();
		expectTypeOf<IsRedundantEntry<undefined, "error">>().toEqualTypeOf<false>();
	});
});

describe("VariantKeyOf", () => {
	it("defaults to game_roblox", () => {
		expectTypeOf<VariantKeyOf<object>>().toEqualTypeOf<"game_roblox">();
	});

	it("resolves explicit axes", () => {
		expectTypeOf<VariantKeyOf<{ type: "package" }>>().toEqualTypeOf<"package_roblox">();
		expectTypeOf<VariantKeyOf<{ roblox: false }>>().toEqualTypeOf<"package_std">();
		expectTypeOf<VariantKeyOf<{ roblox: false; type: "app" }>>().toEqualTypeOf<"game_std">();
		expectTypeOf<VariantKeyOf<{ roblox: true; type: "game" }>>().toEqualTypeOf<"game_roblox">();
	});

	it("widens when type is not a literal", () => {
		expectTypeOf<VariantKeyOf<{ type: "app" | "game" | "package" }>>().toEqualTypeOf<
			"game_roblox" | "package_roblox"
		>();
	});
});

describe("ValidateRulesAgainst", () => {
	type Validate<R, O = object> = ValidateRulesAgainst<R, [MiniDefaults], VariantKeyOf<O>>;

	it("brands redundant entries and passes valid ones through", () => {
		type Result = Validate<{
			"eqeqeq": "error";
			"max-depth": "warn";
			"unknown/rule": "error";
		}>;

		expectTypeOf<Result["max-depth"]>().toEqualTypeOf<"warn">();
		expectTypeOf<Result["unknown/rule"]>().toEqualTypeOf<"error">();
		expectTypeOf<Result["eqeqeq"]>().toEqualTypeOf<
			RedundantRuleError<"'eqeqeq' already defaults to this value in the preset; remove the override, or set `redundancyCheck: false` to disable this check">
		>();
	});

	it("brands a redundant options tuple", () => {
		type Result = Validate<{ "no-console": ["error", { allow: ["warn", "error"] }] }>;
		expectTypeOf<Result["no-console"]>().toExtend<RedundantRuleError<string>>();
	});

	it("selects the variant matching the options", () => {
		type PackageResult = Validate<
			{ "jsdoc/require-description": "error" },
			{ type: "package" }
		>;
		type GameResult = Validate<{ "jsdoc/require-description": "error" }, { type: "game" }>;

		expectTypeOf<PackageResult["jsdoc/require-description"]>().toExtend<
			RedundantRuleError<string>
		>();
		expectTypeOf<GameResult["jsdoc/require-description"]>().toEqualTypeOf<"error">();
	});

	it("skips variant-dependent rules when the variant cannot be resolved", () => {
		type Result = Validate<
			{ "jsdoc/require-description": "error" },
			{ type: "app" | "game" | "package" }
		>;
		expectTypeOf<Result["jsdoc/require-description"]>().toEqualTypeOf<"error">();
	});

	it("preserves optionality", () => {
		type Result = Validate<{ "max-depth"?: "warn" }>;
		expectTypeOf<Result>().toEqualTypeOf<{ "max-depth"?: "warn" }>();
	});
});
