import { DEFAULT_ESLINT_REACT_SETTINGS, isESLintReactSettings } from "@eslint-react/shared";
import type { ESLintReactSettings } from "@eslint-react/shared";

import { describe, it } from "vitest";

import { react } from "../src/eslint/configs/react.ts";
import type { ReactSettings } from "../src/eslint/types.ts";
import { oxlintReact } from "../src/oxlint/configs/react.ts";
import { reactSettings } from "../src/rules/react.ts";

/**
 * Whether two types are identical, rather than merely assignable to each other.
 *
 * Assignability is too weak here: an optional property present on one side and
 * absent from the other satisfies it in both directions, so upstream gaining a
 * setting — the likeliest drift — would go unnoticed. Comparing the identity of
 * two conditional types is invariant, so it catches an added, removed or
 * retyped property alike.
 *
 * @template Left - One of the two types.
 * @template Right - The other.
 */
type Identical<Left, Right> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Each `T` is used once by design: comparing the two conditional types is what makes this invariant.
	(<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

/**
 * `ReactSettings`, but `never` the moment it stops matching upstream, so
 * anything annotated with it stops compiling.
 *
 * `ReactSettings` restates `ESLintReactSettings` so the published declarations
 * carry neither `@eslint-react/shared` nor the `zod` its type is derived from,
 * neither of which a consumer installs. Upstream stays a build-time dependency,
 * checked against here rather than shipped against.
 */
type CheckedReactSettings =
	Identical<ReactSettings, ESLintReactSettings> extends true ? ReactSettings : never;

function findReactXSettings(configs: ReadonlyArray<{ settings?: object }>): unknown {
	const settings = configs.map((config) => config.settings).find((value) => value !== undefined);
	if (settings === undefined || !("react-x" in settings)) {
		throw new Error("No react-x settings were generated");
	}

	return settings["react-x"];
}

describe("react settings", () => {
	it("documents the defaults upstream actually ships", ({ expect }) => {
		expect.assertions(1);

		// Guards the `@default` tags on `ReactSettings`, which are the only
		// place a consumer reads them.
		expect(DEFAULT_ESLINT_REACT_SETTINGS).toStrictEqual({
			importSource: "react",
			polymorphicPropName: "as",
			version: "detect",
		});
	});

	it("produces settings upstream accepts", ({ expect }) => {
		expect.assertions(1);

		// The annotation is the drift check: it collapses to `never` unless our
		// type and upstream's accept each other, and then nothing assigns to
		// it. The assertion below is the runtime half, proving upstream's own
		// validator accepts what our type describes.
		const settings: CheckedReactSettings = {
			additionalEffectHooks: "^useAsyncEffect$",
			additionalRefHooks: "^useLocalRef$",
			additionalStateHooks: "^useLocalState$",
			compilationMode: "annotation",
			importSource: "@rbxts",
			polymorphicPropName: "as",
			version: "17.0.2",
		};

		expect(isESLintReactSettings(settings)).toBe(true);
	});

	it("applies the roblox-ts defaults", ({ expect }) => {
		expect.assertions(1);

		expect(reactSettings()).toStrictEqual({
			importSource: "@rbxts",
			version: "17.0.2",
		});
	});

	it("forwards user settings to both engines", async ({ expect }) => {
		expect.assertions(2);

		const options = {
			additionalRefHooks: "/^use(Latest|Composed)Ref$/u",
			additionalStateHooks: "useLocalState",
		};
		const eslintConfigs = await react({ ...options, stylistic: false, typeAware: false });
		const expected = { ...options, importSource: "@rbxts", version: "17.0.2" };

		expect(findReactXSettings(eslintConfigs)).toStrictEqual(expected);
		expect(findReactXSettings(oxlintReact(options))).toStrictEqual(expected);
	});
});
