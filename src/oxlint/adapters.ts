/**
 * Static naming and package adapters shared by Oxlint code generation and the
 * runtime resolver. Keeping these independent of generated capabilities avoids
 * a code generation → resolver → generated-data cycle.
 */

/**
 * Prefix translation for rules that run via jsPlugins. Native Oxlint plugin
 * prefixes are reserved, so those jsPlugins use `-js` aliases.
 */
export const oxlintJsPluginPrefixRenames: Readonly<Record<string, string>> = {
	"": "eslint-js",
	"import": "import-js",
	"jest": "jest-js",
	"jsdoc": "jsdoc-js",
	"node": "node-js",
	"promise": "promise-js",
	"react": "react-x",
	"unicorn": "unicorn-js",
	"vitest": "vitest-js",
};

/** JsPlugin package specifiers keyed by their Oxlint-side alias. */
export const oxlintJsPlugins: Readonly<Record<string, string>> = {
	"@cspell": "@cspell/eslint-plugin",
	"antfu": "eslint-plugin-antfu",
	"better-max-params": "eslint-plugin-better-max-params",
	"comment-length": "eslint-plugin-comment-length",
	"de-morgan": "eslint-plugin-de-morgan",
	"e18e": "@e18e/eslint-plugin",
	"erasable-syntax-only": "eslint-plugin-erasable-syntax-only",
	"eslint-js": "oxlint-plugin-eslint",
	"eslint-plugin": "eslint-plugin-eslint-plugin",
	"flawless": "eslint-plugin-flawless",
	"import-js": "eslint-plugin-import-lite",
	"jest-extended": "eslint-plugin-jest-extended",
	"jest-js": "eslint-plugin-jest",
	"jsdoc-js": "eslint-plugin-jsdoc",
	"node-js": "eslint-plugin-n",
	"oxfmt": "eslint-plugin-oxfmt",
	"oxlint-comments": "oxlint-plugin-oxlint-comments",
	"perfectionist": "eslint-plugin-perfectionist",
	"promise-js": "eslint-plugin-promise",
	"react-jsx": "eslint-plugin-react-jsx",
	"react-naming-convention": "eslint-plugin-react-naming-convention",
	"react-x": "eslint-plugin-react-x",
	"roblox": "eslint-plugin-roblox-ts",
	"sentinel": "eslint-plugin-sentinel",
	"small-rules": "@pobammer-ts/small-rules",
	"sonar": "eslint-plugin-sonarjs",
	"style": "@stylistic/eslint-plugin",
	"testing-library": "eslint-plugin-testing-library",
	"ts": "@typescript-eslint/eslint-plugin",
	"unicorn-js": "eslint-plugin-unicorn",
	"unused-imports": "eslint-plugin-unused-imports",
	"vitest-js": "@vitest/eslint-plugin",
} as const;

/**
 * Whether a preset config is a pruning view rather than a rule declaration.
 *
 * The formatter-compatibility layer and the Markdown relaxations switch off
 * rules that other modules turned on. Treating their hundreds of standalone
 * `"off"` entries as declarations would make the preset look like it owns
 * rules it merely silences, so both the capability generator and the tests
 * that reason about ownership skip them — through this predicate, so the two
 * cannot disagree about which configs count.
 *
 * @param name - The `name` of the config to classify.
 * @returns Whether the config only prunes rules other configs declare.
 */
export function isPruningViewConfig(name: string | undefined): boolean {
	return name === "isentinel/markdown/disables" || name?.startsWith("isentinel/oxfmt/") === true;
}

/**
 * Rules that run without type information but intentionally remain in ESLint
 * because parser services improve their results.
 *
 * Lives here rather than beside the resolver so the ESLint type-aware split can
 * read it without pulling in the generated capability data, which is ~145 KB
 * this module has no need of.
 */
export const optionallyTypeAwareRules: ReadonlySet<string> = new Set([
	"e18e/prefer-array-at",
	"e18e/prefer-array-to-reversed",
	"e18e/prefer-array-to-sorted",
	"e18e/prefer-spread-syntax",
	"unicorn/no-useless-coercion",
]);

/**
 * Type-aware jsPlugin rules used by the ESLint type-aware split. Some declare
 * the metadata flag; the explicit list also documents known unreliable cases.
 */
export const typeAwareJsPluginRules: ReadonlySet<string> = new Set([
	"eslint-plugin/no-property-in-node",
	"jest/no-error-equal",
	"jest/no-unnecessary-assertion",
	"jest/unbound-method",
	"jest/valid-expect-with-promise",
	"react/no-implicit-children",
	"react/no-implicit-key",
	"react/no-implicit-ref",
	"react/no-leaked-conditional-rendering",
	"react/no-unused-props",
	"sonar/no-ignored-return",
	"sonar/no-incompatible-assertion-types",
	"sonar/no-redundant-optional",
	"sonar/no-try-promise",
	"sonar/prefer-immediate-return",
	"ts/prefer-destructuring",
	"unicorn/no-non-function-verb-prefix",
]);

const ESLINT_ONLY = "eslint-only";
const NATIVE_FIRST = "native-first";

/**
 * Routing policy for every rule family present in the effective preset union.
 * Generation fails when a new family appears without a reviewed policy.
 *
 * Only three values change what the resolver does: `eslint-only` keeps the
 * family out of Oxlint entirely, `js-plugin` prefers the original ESLint plugin
 * over any native port, and `native-first` takes the native rule when one
 * exists. `unmanaged` records that the family is nobody's to route. Adding a
 * family here is what marks it reviewed, so the entry matters even when the
 * value is the default.
 */
export const oxlintFamilyPolicies: Readonly<
	Record<string, "eslint-only" | "js-plugin" | "native-first" | "unmanaged">
> = {
	"": NATIVE_FIRST,
	"@cspell": NATIVE_FIRST,
	"antfu": NATIVE_FIRST,
	"better-max-params": NATIVE_FIRST,
	"comment-length": NATIVE_FIRST,
	"de-morgan": NATIVE_FIRST,
	"e18e": NATIVE_FIRST,
	"erasable-syntax-only": NATIVE_FIRST,
	"eslint-comments": ESLINT_ONLY,
	"eslint-plugin": NATIVE_FIRST,
	"flawless": NATIVE_FIRST,
	"format-lua": ESLINT_ONLY,
	"import": NATIVE_FIRST,
	"isentinel": "unmanaged",
	"jest": "js-plugin",
	// Oxlint has a native `jest` plugin but no `jest-extended` counterpart, so
	// native-first lands on the jsPlugin either way.
	"jest-extended": NATIVE_FIRST,
	"jsdoc": NATIVE_FIRST,
	"jsonc": ESLINT_ONLY,
	"markdown": ESLINT_ONLY,
	"node": NATIVE_FIRST,
	"package-json": ESLINT_ONLY,
	"perfectionist": NATIVE_FIRST,
	"pnpm": ESLINT_ONLY,
	"promise": NATIVE_FIRST,
	"react": "js-plugin",
	"react-jsx": NATIVE_FIRST,
	"react-naming-convention": NATIVE_FIRST,
	"roblox": NATIVE_FIRST,
	"sentinel": NATIVE_FIRST,
	"small-rules": NATIVE_FIRST,
	"sonar": NATIVE_FIRST,
	"style": NATIVE_FIRST,
	"testing-library": "js-plugin",
	"toml": ESLINT_ONLY,
	"ts": NATIVE_FIRST,
	"unicorn": NATIVE_FIRST,
	"unused-imports": NATIVE_FIRST,
	"vitest": NATIVE_FIRST,
	"yaml": ESLINT_ONLY,
};

/**
 * TypeScript extension rules whose equivalence to an Oxlint core rule is
 * explicit and parity-tested. No other `ts/*` rule may infer equivalence from
 * a similarly named core rule.
 */
export const TS_EXTENSION_TO_CORE: ReadonlySet<string> = new Set([
	"default-param-last",
	"no-empty-function",
	"no-shadow",
	"no-unused-expressions",
	"no-unused-private-class-members",
	"no-useless-constructor",
]);

/**
 * Unicorn rules renamed upstream but still exposed under the old Oxlint name.
 */
const UNICORN_NATIVE_RENAMES: Readonly<Record<string, string>> = {
	"no-for-each": "no-array-for-each",
};

/**
 * Split a canonical ESLint rule name into its prefix and local rule name.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Its prefix and local name.
 */
export function splitRuleName(rule: string): { name: string; prefix: string } {
	const slashIndex = rule.indexOf("/");
	if (slashIndex === -1) {
		return { name: rule, prefix: "" };
	}

	return { name: rule.slice(slashIndex + 1), prefix: rule.slice(0, slashIndex) };
}

/**
 * The name a canonical ESLint rule would take as a native Oxlint rule.
 * Existence is deliberately left to generated capability metadata.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns A name to look up in the generated native capability table.
 */
export function candidateNativeOxlintName(rule: string): string {
	const { name, prefix } = splitRuleName(rule);

	if (prefix === "") {
		return name;
	}

	if (prefix === "ts") {
		return TS_EXTENSION_TO_CORE.has(name) ? name : `typescript/${name}`;
	}

	if (prefix === "unicorn") {
		return `unicorn/${UNICORN_NATIVE_RENAMES[name] ?? name}`;
	}

	return rule;
}

/**
 * Resolve the jsPlugin adapter for a canonical ESLint rule name.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns The Oxlint alias, translated name and package specifier, if known.
 */
export function jsPluginAdapterFor(
	rule: string,
): undefined | { oxlintName: string; pluginAlias: string; specifier: string } {
	const { name, prefix } = splitRuleName(rule);
	const pluginAlias = oxlintJsPluginPrefixRenames[prefix] ?? prefix;
	const specifier = oxlintJsPlugins[pluginAlias];
	if (specifier === undefined) {
		return undefined;
	}

	return {
		oxlintName: `${pluginAlias}/${name}`,
		pluginAlias,
		specifier,
	};
}
