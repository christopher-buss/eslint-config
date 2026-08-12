import { describe, expect, it } from "vitest";

import { deriveRobloxAllowedWords } from "../scripts/roblox-allowed-words-shared.ts";
import { ROBLOX_ALLOWED_WORDS } from "../src/generated/roblox-allowed-words.ts";

describe("roblox allowed-words snapshot", () => {
	it("matches the installed @rbxts/types", async () => {
		expect.assertions(1);

		// The naming config reads the snapshot instead of parsing ~4MB of
		// `.d.ts` on every load, so a `@rbxts/types` bump that adds a name with
		// two capitals in a row must be followed by `pnpm gen` or no identifier
		// can spell that name under the strict formats.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(await deriveRobloxAllowedWords());
	});

	it("keeps the names that already hold two capitals", () => {
		expect.assertions(1);

		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.arrayContaining([
				"CFrame",
				"RBXScriptConnection",
				"RBXScriptSignal",
				"UDim",
				"UIListLayout",
			]),
		);
	});

	it("keeps the names that end in a capital", () => {
		expect.assertions(1);

		// Fine alone, but they collide with the next word's capital once
		// something follows: `Motor6D` is legal, `motor6DWeld` is not.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.arrayContaining(["Motor6D", "Path2D", "Path3D", "RotateP", "RotateV"]),
		);
	});

	it("keeps member names, not just type names", () => {
		expect.assertions(1);

		// No type is called `ZIndex` or `TextureID`; they are properties, and a
		// variable is as likely to be named after one as after a type.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.arrayContaining(["TextureID", "UVOffset", "ZIndex"]),
		);
	});

	it("drops one-character words", () => {
		expect.assertions(1);

		// `Vector3.X` and friends qualify under the trailing-capital arm, but
		// folding a word only lowercases its tail and a single capital has
		// none, so listing them could never change an outcome.
		expect(ROBLOX_ALLOWED_WORDS.filter((word) => word.length < 2)).toStrictEqual([]);
	});

	it("drops names a shorter word already resolves", () => {
		expect.assertions(1);

		// `CFrame` matches at a hump boundary inside the first three, `Path2D`
		// inside the fourth and `ZIndex` inside the last, so listing them
		// separately would only add work at lint time.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.not.arrayContaining([
				"CFrameConstructor",
				"CFrameValue",
				"UserCFrame",
				"Path2DControlPoint",
				"ZIndexBehavior",
			]),
		);
	});
});
