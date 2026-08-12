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

	it("drops names a shorter word already resolves", () => {
		expect.assertions(1);

		// `CFrame` matches at a hump boundary inside the first three and
		// `Path2D` inside the last, so listing them separately would only add
		// work at lint time.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.not.arrayContaining([
				"CFrameConstructor",
				"CFrameValue",
				"UserCFrame",
				"Path2DControlPoint",
			]),
		);
	});
});
