import parserTs from "@typescript-eslint/parser";

import { Linter } from "eslint";
import pluginPerfectionist from "eslint-plugin-perfectionist";
import { describe, it } from "vitest";

import type { PerfectionistRuleOptions } from "../src/rules/perfectionist.ts";
import { perfectionistRules, perfectionistSettings } from "../src/rules/perfectionist.ts";

/**
 * Fix a snippet with the shipped `sort-constructor-parameters` configuration.
 *
 * @param source - The snippet to fix.
 * @param options - Preset options passed to `perfectionistRules`.
 * @returns The fixed source.
 */
function fix(source: string, options?: PerfectionistRuleOptions): string {
	const rule = perfectionistRules(options)["perfectionist/sort-constructor-parameters"];
	const config: Linter.Config = {
		files: ["**/*.ts"],
		languageOptions: { parser: parserTs },
		plugins: { perfectionist: pluginPerfectionist },
		rules: { "perfectionist/sort-constructor-parameters": rule ?? "off" },
		settings: { ...perfectionistSettings },
	};

	const linter = new Linter();
	return linter.verifyAndFix(source, config, "file.ts").output;
}

const UNSORTED_PARAMETERS =
	"public constructor(private readonly logger: Logger, private readonly playerService: PlayerService, private readonly mtxService: MtxService) {}";

describe("constructor parameter sorting", () => {
	it.for(["Service", "Controller", "Component"])(
		"sorts the injected parameters of a @%s class",
		(decorator, { expect }) => {
			expect.assertions(1);

			const output = fix(`@${decorator}()\nclass Foo {\n\t${UNSORTED_PARAMETERS}\n}`);

			expect(output).toContain(
				"constructor(private readonly logger: Logger, private readonly mtxService: MtxService, private readonly playerService: PlayerService)",
			);
		},
	);

	it("leaves a class without a DI decorator positional", ({ expect }) => {
		expect.assertions(1);

		const source = `class Foo {\n\t${UNSORTED_PARAMETERS}\n}`;

		expect(fix(source)).toBe(source);
	});

	it("sorts an exported DI class", ({ expect }) => {
		expect.assertions(1);

		const output = fix(`@Service()\nexport class Foo {\n\t${UNSORTED_PARAMETERS}\n}`);

		expect(output).toContain("logger: Logger, private readonly mtxService");
	});

	it("leaves a nested class in a DI class positional", ({ expect }) => {
		expect.assertions(1);

		const source = `@Service()\nclass Foo {\n\tpublic run(): void {\n\t\tclass Bar {\n\t\t\t${UNSORTED_PARAMETERS}\n\t\t}\n\t}\n}`;

		expect(fix(source)).toBe(source);
	});

	it("leaves a class with another decorator positional", ({ expect }) => {
		expect.assertions(1);

		const source = `@Command()\nclass Foo {\n\t${UNSORTED_PARAMETERS}\n}`;

		expect(fix(source)).toBe(source);
	});

	it("keeps named groups first, in the given order", ({ expect }) => {
		expect.assertions(1);

		const output = fix(
			"@Service()\nclass Foo {\n\tpublic constructor(private readonly characterService: CharacterService, private readonly logger: Logger, private readonly config: Config, private readonly animationService: AnimationService) {}\n}",
			{ constructorParameterGroups: ["logger", "config"] },
		);

		expect(output).toContain(
			"constructor(private readonly logger: Logger, private readonly config: Config, private readonly animationService: AnimationService, private readonly characterService: CharacterService)",
		);
	});

	it("matches group names exactly", ({ expect }) => {
		expect.assertions(1);

		const output = fix(
			"@Service()\nclass Foo {\n\tpublic constructor(private readonly blogger: Factory, private readonly logger: Logger) {}\n}",
			{ constructorParameterGroups: ["logger"] },
		);

		// An unanchored pattern would pull `blogger` into the `logger` group,
		// where it sorts first.
		expect(output).toContain(
			"constructor(private readonly logger: Logger, private readonly blogger: Factory)",
		);
	});
});
