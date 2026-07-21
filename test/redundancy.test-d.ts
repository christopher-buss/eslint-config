import { describe, expectTypeOf, it } from "vitest";

import type { VARIANT_KEYS } from "../scripts/typegen-defaults-shared.ts";
import type { ValidatedOverrideKeys } from "../src/eslint/redundancy.ts";
import type { OptionsConfig } from "../src/eslint/types.ts";
import type { OxlintValidatedOverrideKeys } from "../src/oxlint/redundancy.ts";
import type { OxlintOptionsConfig } from "../src/oxlint/types.ts";
import type {
	IsRedundantEntry,
	RedundantRuleError,
	ValidateRulesAgainst,
	VariantKey,
	VariantKeyOf,
} from "../src/redundancy.ts";

type HasOverrides<V> = V extends object ? ("overrides" extends keyof V ? true : never) : never;

/**
 * Options keys whose value union includes an object carrying `overrides`.
 *
 * @template O - The factory options type to scan.
 */
type OverrideBearingKeys<O> = {
	[K in keyof O]-?: true extends HasOverrides<NonNullable<O[K]>> ? K : never;
}[keyof O];

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

	it("widens both axes when roblox is not a literal", () => {
		expectTypeOf<VariantKeyOf<{ roblox: boolean }>>().toEqualTypeOf<VariantKey>();
		expectTypeOf<VariantKeyOf<{ roblox: boolean; type: "package" }>>().toEqualTypeOf<
			"package_roblox" | "package_std"
		>();
	});
});

describe("IsRedundantEntry with dropped-options markers", () => {
	interface Marker {
		severityOnly: "error";
	}

	it("treats a marker like the severity when options are retained (ESLint)", () => {
		expectTypeOf<IsRedundantEntry<"error", Marker>>().toEqualTypeOf<true>();
		expectTypeOf<IsRedundantEntry<"warn", Marker>>().toEqualTypeOf<false>();
	});

	it("never flags against a marker when entries are replaced wholesale (oxlint)", () => {
		expectTypeOf<IsRedundantEntry<"error", Marker, false>>().toEqualTypeOf<false>();
	});

	it("never flags option tuples against a marker", () => {
		expectTypeOf<IsRedundantEntry<["error", { x: 1 }], Marker>>().toEqualTypeOf<false>();
		expectTypeOf<IsRedundantEntry<["error", { x: 1 }], Marker, false>>().toEqualTypeOf<false>();
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

describe("ValidateRulesAgainst chain resolution", () => {
	interface DeltaMap {
		"max-depth": { game_roblox: "off" };
	}
	interface BaseMap {
		"max-depth": { "*": "error" };
	}
	type Chain = [DeltaMap, BaseMap];

	it("falls through to the base map for variants the delta does not cover", () => {
		type Result = ValidateRulesAgainst<{ "max-depth": "error" }, Chain, "package_roblox">;

		expectTypeOf<Result["max-depth"]>().toExtend<RedundantRuleError<string>>();
	});

	it("uses the delta value for variants it covers", () => {
		type Flagged = ValidateRulesAgainst<{ "max-depth": "off" }, Chain, "game_roblox">;
		type Allowed = ValidateRulesAgainst<{ "max-depth": "error" }, Chain, "game_roblox">;

		expectTypeOf<Flagged["max-depth"]>().toExtend<RedundantRuleError<string>>();
		expectTypeOf<Allowed["max-depth"]>().toEqualTypeOf<"error">();
	});

	it("skips when a union variant has no default in any map", () => {
		interface PartialBase {
			"max-depth": { game_roblox: "error" };
		}
		type Result = ValidateRulesAgainst<
			{ "max-depth": "error" },
			[PartialBase],
			"game_roblox" | "game_std"
		>;

		expectTypeOf<Result["max-depth"]>().toEqualTypeOf<"error">();
	});

	it("flags when every union variant resolves to the written value", () => {
		type Result = ValidateRulesAgainst<
			{ "max-depth": "error" },
			[BaseMap],
			"game_roblox" | "game_std"
		>;

		expectTypeOf<Result["max-depth"]>().toExtend<RedundantRuleError<string>>();
	});
});

describe("wiring exhaustiveness", () => {
	it("validates every override-bearing option of the ESLint factory", () => {
		// Fails when a new sub-config with `overrides` is added to
		// OptionsConfig without wiring it into ValidateOptionsWith.
		expectTypeOf<
			Exclude<OverrideBearingKeys<OptionsConfig>, ValidatedOverrideKeys>
		>().toEqualTypeOf<never>();
	});

	it("validates every override-bearing option of the oxlint factory", () => {
		expectTypeOf<
			Exclude<OverrideBearingKeys<OxlintOptionsConfig>, OxlintValidatedOverrideKeys>
		>().toEqualTypeOf<never>();
	});

	it("keeps the generator variant matrix in sync with VariantKey", () => {
		expectTypeOf<(typeof VARIANT_KEYS)[number]>().toEqualTypeOf<VariantKey>();
	});
});
