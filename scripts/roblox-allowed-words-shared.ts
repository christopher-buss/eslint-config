import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Derives the Roblox names that `flawless/naming-convention` has to be told
 * about, from the installed `@rbxts/types`.
 *
 * Shared by `roblox-allowed-words-gen.ts` and the drift spec, so both sides
 * agree on what "in sync" means.
 */

/**
 * The `.d.ts` files inside `@rbxts/types` that declare names an identifier can
 * be built from: the hand-written datatypes, the generated Instance classes,
 * and the generated enum namespaces.
 */
const SOURCES = [
	"include/roblox.d.ts",
	"include/generated/None.d.ts",
	"include/generated/enums.d.ts",
];

/**
 * The sources whose properties are worth scraping as well as their type names.
 *
 * A property is as likely to name a variable as the type is - `autoZIndex`
 * holds a `ZIndex`, and no type is called `ZIndex`. Enum items are excluded:
 * they are only ever reached as `Enum.TextXAlignment.Center`, never declared.
 */
const MEMBER_SOURCES = ["include/roblox.d.ts", "include/generated/None.d.ts"];

/**
 * `declare const CFrame: CFrameConstructor` - the datatype values.
 */
const DECLARE_CONST = /^declare const (\w+) *:/gmu;

/**
 * `interface CFrame` / `interface UIListLayout` - the datatype and Instance
 * types. Anchored to column zero so nested members are skipped.
 */
const TOP_LEVEL_INTERFACE = /^interface (\w+)/gmu;

/**
 * `export namespace TextXAlignment` inside `declare namespace Enum`.
 */
const ENUM_NAMESPACE = /^[\t ]*export namespace (\w+)/gmu;

/**
 * `ZIndex: number` - the data properties declared inside an interface, which
 * the leading indent distinguishes from the interface itself.
 *
 * Methods are deliberately excluded. A property lends its spelling to whatever
 * holds it, but a call is written out at the call site, where the API spelling
 * is already required and no naming rule applies - so `Color3.ToHSV` is no
 * reason to let a variable be called `toHSV`, and `toHsv` is the name to use.
 * All three declaration forms count as a method: `ToHSV(this: Color3): T`,
 * `Name<T>(value: T): T`, and `toHSV: (color: Color3) => T`. The lookahead
 * does its own whitespace skip, because a negative lookahead after `\s*` would
 * backtrack to zero width and then test the space rather than the `(`.
 */
const INTERFACE_MEMBER = /^[\t ]+(?:readonly )?(\w+)\??\s*:(?=\s*[^\s(<])/gmu;

const CONSECUTIVE_CAPITALS = /[A-Z]{2}/u;

/**
 * A name ending in a capital is only a problem once something follows it, and
 * in either strict format the next word starts with a capital - `Motor6D` is
 * fine on its own but `motor6DWeld` is not.
 */
const TRAILING_CAPITAL = /[A-Z]$/u;

/**
 * The Roblox names a `strictCamelCase` / `StrictPascalCase` identifier cannot
 * spell without an escape.
 *
 * Only names that can put two capitals in a row need listing, which turns the
 * ~7000 declared names and members into a few hundred. The list is then pruned:
 * a name is dropped when the words already kept resolve it anyway, so `CFrame`
 * absorbs `CFrameValue`, `CFrameConstructor` and `UserCFrame`, `UDim` absorbs
 * `UDim2`, and `ZIndex` absorbs `ZIndexBehavior`. Candidates are visited
 * shortest-first so the more general word is always the one kept.
 *
 * Comparisons are by code unit rather than `localeCompare`, so the output does
 * not depend on the host locale.
 *
 * @returns The pruned word list, sorted.
 */
export async function deriveRobloxAllowedWords(): Promise<Array<string>> {
	const declared = await readDeclaredNames();
	const candidates = [...declared]
		.filter((name) => needsAllowing(name))
		.sort((left, right) => left.length - right.length || (left < right ? -1 : 1));

	const kept: Array<string> = [];
	for (const candidate of candidates) {
		const longestFirst = kept.toSorted((left, right) => right.length - left.length);
		if (needsAllowing(applyAllowedWords(candidate, longestFirst))) {
			kept.push(candidate);
		}
	}

	return kept.toSorted((left, right) => (left < right ? -1 : 1));
}

/**
 * Whether a character is an ASCII capital. Roblox names are ASCII, and this has
 * to agree with the rule's own notion of a hump, which is `toUpperCase`-based.
 *
 * @param character - The single character to test.
 * @returns True when the character is `A` through `Z`.
 */
function isUppercaseCharacter(character: string): boolean {
	return character >= "A" && character <= "Z";
}

/**
 * The longest allowed word starting at `index`, if that position opens a hump.
 *
 * A word only matches at the start of the name or after a character that is not
 * uppercase, so it can never split an existing hump.
 *
 * @param name - The name being rewritten.
 * @param allowedWords - The words to look for, longest first.
 * @param index - The position to test.
 * @returns The matched word, or `undefined`.
 */
function findWordAt(
	name: string,
	allowedWords: ReadonlyArray<string>,
	index: number,
): string | undefined {
	const previous = index === 0 ? undefined : name[index - 1];
	if (previous !== undefined && isUppercaseCharacter(previous)) {
		return undefined;
	}

	return allowedWords.find((candidate) => name.startsWith(candidate, index));
}

/**
 * Mirrors `applyAllowedWords` from `eslint-plugin-flawless`: rewrites every
 * allowed word that occurs at a hump boundary so its tail reads as one
 * lowercase run.
 *
 * The pruning above needs to ask the same question the rule will ask at lint
 * time - "does this name still trip the strict formats?" - so the two
 * implementations have to stay in step.
 *
 * @param name - The name to rewrite.
 * @param allowedWords - The words to fold into single humps, longest first.
 * @returns The name with each matched word's tail lowercased.
 */
function applyAllowedWords(name: string, allowedWords: ReadonlyArray<string>): string {
	let result = "";
	let index = 0;

	while (index < name.length) {
		const word = findWordAt(name, allowedWords, index);
		if (word === undefined) {
			result += name[index];
			index += 1;
			continue;
		}

		result += word[0] + word.slice(1).toLowerCase();
		index += word.length;
	}

	return result;
}

/**
 * Whether a name can put two capitals in a row, which is what the strict
 * formats reject.
 *
 * Two ways to get there: the name already holds a pair (`CFrame`), or it ends
 * in a capital and so collides with whatever word follows it in an identifier
 * (`Motor6D` in `motor6DWeld`). Checking the name in isolation catches only the
 * first.
 *
 * @param name - The name to test.
 * @returns True when the name needs to be in the list.
 */
function needsAllowing(name: string): boolean {
	// A one-character word folds to itself - `applyAllowedWords` only lowercases
	// a word's tail, and a single capital has none - so listing `X` can never
	// change an outcome. Members like `Vector3.X` would otherwise qualify under
	// the trailing-capital arm and sit in the list doing nothing.
	if (name.length < 2) {
		return false;
	}

	return CONSECUTIVE_CAPITALS.test(name) || TRAILING_CAPITAL.test(name);
}

/**
 * Adds every capture of every pattern to `names`.
 *
 * @param content - The file to scan.
 * @param patterns - The global-flagged patterns to run, each capturing a name.
 * @param names - The set to add to.
 */
function collectNames(content: string, patterns: Array<RegExp>, names: Set<string>): void {
	for (const pattern of patterns) {
		for (const [, name] of content.matchAll(pattern)) {
			if (name !== undefined) {
				names.add(name);
			}
		}
	}
}

/**
 * Reads one `@rbxts/types` source.
 *
 * @param root - The resolved package root.
 * @param source - The path within the package.
 * @returns The file contents.
 */
async function readSource(root: string, source: string): Promise<string> {
	return fs.readFile(path.join(root, source), "utf8");
}

/**
 * Reads every name an identifier can be built from out of `@rbxts/types`.
 *
 * @returns The union of datatype, Instance, enum and member names.
 */
async function readDeclaredNames(): Promise<Set<string>> {
	const require = createRequire(import.meta.url);
	const root = path.dirname(require.resolve("@rbxts/types/package.json"));
	const [typeSources, memberSources] = await Promise.all([
		Promise.all(SOURCES.map(async (source) => readSource(root, source))),
		Promise.all(MEMBER_SOURCES.map(async (source) => readSource(root, source))),
	]);

	const names = new Set<string>();
	for (const content of typeSources) {
		collectNames(content, [DECLARE_CONST, TOP_LEVEL_INTERFACE, ENUM_NAMESPACE], names);
	}

	for (const content of memberSources) {
		collectNames(content, [INTERFACE_MEMBER], names);
	}

	return names;
}
