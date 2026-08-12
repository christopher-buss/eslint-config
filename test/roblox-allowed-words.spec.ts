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

	it("keeps the names the strict formats reject", () => {
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

	it("drops names a shorter word already resolves", () => {
		expect.assertions(1);

		// `CFrame` matches at a hump boundary inside all three, so listing them
		// separately would only add work at lint time.
		expect(ROBLOX_ALLOWED_WORDS).toStrictEqual(
			expect.not.arrayContaining(["CFrameConstructor", "CFrameValue", "UDim2", "UserCFrame"]),
		);
	});
});
