/**
 * Per-rule mapping between the ESLint config and oxlint for hybrid mode.
 *
 * Every rule listed here is covered by oxlint: when the ESLint factory runs
 * with `oxlint: true` it drops these rules, and the oxlint factory enables
 * them (translated via {@link translateRuleToOxlint}).
 *
 * Rules NOT listed here stay in ESLint. Notable families that intentionally
 * stay are documented in {@link staysInEslint}.
 */

/** Where a rule runs when linting with oxlint. */
export type OxlintTarget =
	/** Runs inside oxlint via a jsPlugin (the original ESLint plugin). */
	| "js-plugin"
	/** Implemented natively in oxlint (Rust). */
	| "native"
	/** Type-aware rule implemented by oxlint-tsgolint (`oxlint --type-aware`). */
	| "tsgolint";

/**
 * Notable rule families that intentionally stay in ESLint in hybrid mode,
 * with the reason why.
 */
export const staysInEslint: Readonly<Record<string, string>> = {
	"cease-nonsense/prefer-read-only-props":
		"Type-aware custom rule; oxlint jsPlugins have no type information",
	"e18e/*": "Kept in ESLint to limit hybrid-mode scope; candidate for a future move",
	"eslint-comments/*":
		"Lints eslint-disable directives, which only exist in ESLint-linted code; oxlint-comments covers oxlint directives",
	"flawless/*": "Type-aware custom rules; oxlint jsPlugins have no type information",
	"format-lua/*": "Oxlint cannot lint Lua files",
	"jest-extended/*": "Stays with the jest rules (see test/*)",
	"jsonc/yaml/toml/markdown/package-json/pnpm/sort-*":
		"Oxlint only lints JS/TS files; JSON, YAML, TOML and Markdown stay in ESLint",
	"react/*":
		"Optional peer plugin set with type-aware rules interleaved; standalone oxlint offers a react config, hybrid keeps it in ESLint",
	"roblox/* (type-aware)":
		"Type-aware custom rules (lua-truthiness etc.); oxlint jsPlugins have no type information",
	"sentinel/explicit-size-check":
		"Type-aware custom rule; oxlint jsPlugins have no type information",
	"test/*":
		"Jest rules stay in ESLint: the native oxlint jest plugin does not support settings.jest.globalPackage (https://github.com/oxc-project/oxc/issues/23290) and we use @rbxts/jest-globals",
	"type-aware jsPlugin rules":
		"Rules whose meta.docs.requiresTypeChecking is true crash or silently no-op under oxlint's jsPlugin runtime (no type information): sonar/no-ignored-return, sonar/no-redundant-optional, sonar/no-try-promise, unicorn/no-non-function-verb-prefix, arrow-style/no-export-default-arrow, eslint-plugin/no-property-in-node, test/no-error-equal, test/no-unnecessary-assertion, test/unbound-method, test/valid-expect-with-promise",
	"unicorn/no-unsafe-string-replacement":
		"False positives under oxlint's jsPlugin scope analysis (template-literal replacements are not resolved)",
	"vitest/*":
		"Optional peer plugin whose rule set diverges from oxlint's native vitest plugin; kept in ESLint when in doubt",
};

export const oxlintRuleMapping: Readonly<Record<string, OxlintTarget>> = {
	// Part: Core JavaScript (native)
	"accessor-pairs": "native",
	"array-callback-return": "native",
	"block-scoped-var": "native",
	"constructor-super": "native",
	"curly": "native",
	"default-case-last": "native",
	"eqeqeq": "native",
	"for-direction": "native",
	"func-style": "native",
	"logical-assignment-operators": "native",
	"max-classes-per-file": "native",
	"max-depth": "native",
	"max-lines": "native",
	"max-lines-per-function": "native",
	"new-cap": "native",
	"no-alert": "native",
	"no-array-constructor": "native",
	"no-async-promise-executor": "native",
	"no-caller": "native",
	"no-case-declarations": "native",
	"no-class-assign": "native",
	"no-compare-neg-zero": "native",
	"no-cond-assign": "native",
	"no-console": "native",
	"no-const-assign": "native",
	"no-constant-condition": "native",
	"no-control-regex": "native",
	"no-debugger": "native",
	"no-delete-var": "native",
	"no-dupe-class-members": "native",
	"no-dupe-keys": "native",
	"no-duplicate-case": "native",
	"no-else-return": "native",
	"no-empty": "native",
	"no-empty-character-class": "native",
	"no-empty-function": "native",
	"no-empty-pattern": "native",
	"no-empty-static-block": "native",
	"no-eval": "native",
	"no-ex-assign": "native",
	"no-extend-native": "native",
	"no-extra-bind": "native",
	"no-extra-boolean-cast": "native",
	"no-fallthrough": "native",
	"no-func-assign": "native",
	"no-global-assign": "native",
	"no-implied-eval": "native",
	"no-import-assign": "native",
	"no-inline-comments": "native",
	"no-invalid-regexp": "native",
	"no-irregular-whitespace": "native",
	"no-iterator": "native",
	"no-labels": "native",
	"no-lone-blocks": "native",
	"no-lonely-if": "native",
	"no-loss-of-precision": "native",
	"no-misleading-character-class": "native",
	"no-multi-str": "native",
	"no-new": "native",
	"no-new-func": "native",
	"no-new-native-nonconstructor": "native",
	"no-new-wrappers": "native",
	"no-obj-calls": "native",
	"no-proto": "native",
	"no-prototype-builtins": "native",
	"no-redeclare": "native",
	"no-regex-spaces": "native",
	"no-restricted-globals": "native",
	"no-restricted-properties": "native",
	"no-return-assign": "native",
	"no-self-assign": "native",
	"no-self-compare": "native",
	"no-sequences": "native",
	"no-shadow": "native",
	"no-shadow-restricted-names": "native",
	"no-sparse-arrays": "native",
	"no-template-curly-in-string": "native",
	"no-this-before-super": "native",
	"no-throw-literal": "native",
	"no-undef": "native",
	"no-unexpected-multiline": "native",
	"no-unmodified-loop-condition": "native",
	"no-unneeded-ternary": "native",
	"no-unreachable": "native",
	"no-unreachable-loop": "native",
	"no-unsafe-finally": "native",
	"no-unsafe-negation": "native",
	"no-unsafe-optional-chaining": "native",
	"no-unused-expressions": "native",
	"no-unused-private-class-members": "native",
	"no-use-before-define": "native",
	"no-useless-backreference": "native",
	"no-useless-call": "native",
	"no-useless-catch": "native",
	"no-useless-computed-key": "native",
	"no-useless-constructor": "native",
	"no-useless-rename": "native",
	"no-useless-return": "native",
	"no-var": "native",
	"no-with": "native",
	"object-shorthand": "native",
	"prefer-arrow-callback": "native",
	"prefer-const": "native",
	"prefer-exponentiation-operator": "native",
	"prefer-promise-reject-errors": "native",
	"prefer-regex-literals": "native",
	"prefer-rest-params": "native",
	"prefer-spread": "native",
	"prefer-template": "native",
	"symbol-description": "native",
	"unicode-bom": "native",
	"use-isnan": "native",
	"valid-typeof": "native",
	"vars-on-top": "native",
	"yoda": "native",

	// Part: Core JavaScript (not implemented natively; run via
	"dot-notation": "js-plugin",
	// oxlint-plugin-eslint)
	// id-length runs via jsPlugin: oxlint's native port also flags TypeScript
	// type parameters (https://github.com/oxc-project/oxc/issues/19617)
	"id-length": "js-plugin",
	"no-dupe-args": "js-plugin",
	"no-octal": "js-plugin",
	"no-octal-escape": "js-plugin",
	"no-restricted-syntax": "js-plugin",
	"no-undef-init": "js-plugin",
	"one-var": "js-plugin",

	// Part: TypeScript extension rules implemented by oxlint's core rules
	// (oxlint's core rules are TypeScript-aware)
	"ts/default-param-last": "native",
	"ts/no-empty-function": "native",
	"ts/no-shadow": "native",
	"ts/no-unused-expressions": "native",
	"ts/no-unused-private-class-members": "native",
	"ts/no-useless-constructor": "native",
	"ts/prefer-destructuring": "native",

	// Part: TypeScript (native, no type information required)
	"ts/array-type": "native",
	"ts/ban-ts-comment": "native",
	"ts/consistent-generic-constructors": "native",
	"ts/consistent-indexed-object-style": "native",
	"ts/consistent-type-assertions": "native",
	"ts/consistent-type-definitions": "native",
	"ts/consistent-type-imports": "native",
	"ts/explicit-function-return-type": "native",
	"ts/explicit-member-accessibility": "native",
	"ts/no-confusing-non-null-assertion": "native",
	"ts/no-duplicate-enum-values": "native",
	"ts/no-empty-object-type": "native",
	"ts/no-extra-non-null-assertion": "native",
	"ts/no-extraneous-class": "native",
	"ts/no-import-type-side-effects": "native",
	"ts/no-inferrable-types": "native",
	"ts/no-misused-new": "native",
	"ts/no-non-null-asserted-nullish-coalescing": "native",
	"ts/no-non-null-asserted-optional-chain": "native",
	"ts/no-non-null-assertion": "native",
	"ts/no-require-imports": "native",
	"ts/no-this-alias": "native",
	"ts/no-unnecessary-parameter-property-assignment": "native",
	"ts/no-unnecessary-type-constraint": "native",
	"ts/no-unsafe-declaration-merging": "native",
	"ts/no-unsafe-function-type": "native",
	"ts/no-wrapper-object-types": "native",
	"ts/prefer-as-const": "native",
	"ts/prefer-for-of": "native",
	"ts/prefer-function-type": "native",
	"ts/prefer-literal-enum-member": "native",
	"ts/prefer-namespace-keyword": "native",

	// Part: TypeScript (type-aware, implemented by oxlint-tsgolint)
	"ts/await-thenable": "tsgolint",
	"ts/dot-notation": "tsgolint",
	"ts/no-confusing-void-expression": "tsgolint",
	"ts/no-deprecated": "tsgolint",
	"ts/no-duplicate-type-constituents": "tsgolint",
	"ts/no-floating-promises": "tsgolint",
	"ts/no-for-in-array": "tsgolint",
	"ts/no-implied-eval": "tsgolint",
	"ts/no-meaningless-void-operator": "tsgolint",
	"ts/no-misused-promises": "tsgolint",
	"ts/no-mixed-enums": "tsgolint",
	"ts/no-redundant-type-constituents": "tsgolint",
	"ts/no-unnecessary-boolean-literal-compare": "tsgolint",
	"ts/no-unnecessary-condition": "tsgolint",
	"ts/no-unnecessary-qualifier": "tsgolint",
	"ts/no-unnecessary-template-expression": "tsgolint",
	"ts/no-unnecessary-type-arguments": "tsgolint",
	"ts/no-unnecessary-type-assertion": "tsgolint",
	"ts/no-unnecessary-type-parameters": "tsgolint",
	"ts/no-unsafe-argument": "tsgolint",
	"ts/no-unsafe-assignment": "tsgolint",
	"ts/no-unsafe-call": "tsgolint",
	"ts/no-unsafe-enum-comparison": "tsgolint",
	"ts/no-unsafe-member-access": "tsgolint",
	"ts/no-unsafe-return": "tsgolint",
	"ts/no-unsafe-unary-minus": "tsgolint",
	"ts/no-useless-default-assignment": "tsgolint",
	"ts/non-nullable-type-assertion-style": "tsgolint",
	"ts/only-throw-error": "tsgolint",
	"ts/prefer-find": "tsgolint",
	"ts/prefer-includes": "tsgolint",
	"ts/prefer-nullish-coalescing": "tsgolint",
	"ts/prefer-optional-chain": "tsgolint",
	"ts/prefer-promise-reject-errors": "tsgolint",
	"ts/prefer-readonly": "tsgolint",
	"ts/prefer-reduce-type-parameter": "tsgolint",
	"ts/prefer-return-this-type": "tsgolint",
	"ts/promise-function-async": "tsgolint",
	"ts/restrict-plus-operands": "tsgolint",
	"ts/return-await": "tsgolint",
	"ts/strict-boolean-expressions": "tsgolint",
	"ts/strict-void-return": "tsgolint",
	"ts/switch-exhaustiveness-check": "tsgolint",
	"ts/unbound-method": "tsgolint",
	"ts/use-unknown-in-catch-callback-variable": "tsgolint",

	// Part: Unicorn (native)
	"unicorn/catch-error-name": "native",
	"unicorn/consistent-function-scoping": "native",
	"unicorn/consistent-template-literal-escape": "native",
	"unicorn/filename-case": "native",
	"unicorn/no-array-fill-with-reference-type": "native",
	"unicorn/no-await-expression-member": "native",
	"unicorn/no-empty-file": "native",
	"unicorn/no-for-each": "native",
	"unicorn/no-immediate-mutation": "native",
	"unicorn/no-lonely-if": "native",
	"unicorn/no-negation-in-equality-check": "native",
	"unicorn/no-object-as-default-parameter": "native",
	"unicorn/no-single-promise-in-promise-methods": "native",
	"unicorn/no-static-only-class": "native",
	"unicorn/no-unreadable-array-destructuring": "native",
	"unicorn/no-useless-collection-argument": "native",
	"unicorn/no-useless-iterator-to-array": "native",
	"unicorn/no-useless-promise-resolve-reject": "native",
	"unicorn/no-useless-undefined": "native",
	"unicorn/number-literal-case": "native",
	"unicorn/prefer-array-flat-map": "native",
	"unicorn/prefer-default-parameters": "native",
	"unicorn/prefer-export-from": "native",
	"unicorn/prefer-includes": "native",
	"unicorn/prefer-logical-operator-over-ternary": "native",
	"unicorn/prefer-optional-catch-binding": "native",
	"unicorn/prefer-set-has": "native",
	"unicorn/prefer-single-call": "native",
	"unicorn/prefer-ternary": "native",
	"unicorn/switch-case-braces": "native",
	"unicorn/throw-new-error": "native",

	// Part: Unicorn (run via jsPlugin)
	"unicorn/consistent-compound-words": "js-plugin",
	"unicorn/consistent-conditional-object-spread": "js-plugin",
	"unicorn/consistent-destructuring": "js-plugin",
	"unicorn/consistent-json-file-read": "js-plugin",
	"unicorn/consistent-tuple-labels": "js-plugin",
	"unicorn/isolated-functions": "js-plugin",
	"unicorn/name-replacements": "js-plugin",
	"unicorn/no-accidental-bitwise-operator": "js-plugin",
	"unicorn/no-array-concat-in-loop": "js-plugin",
	"unicorn/no-array-sort-for-min-max": "js-plugin",
	"unicorn/no-async-promise-finally": "js-plugin",
	"unicorn/no-boolean-sort-comparator": "js-plugin",
	"unicorn/no-break-in-nested-loop": "js-plugin",
	"unicorn/no-confusing-array-splice": "js-plugin",
	"unicorn/no-constant-zero-expression": "js-plugin",
	"unicorn/no-declarations-before-early-exit": "js-plugin",
	"unicorn/no-double-comparison": "js-plugin",
	"unicorn/no-duplicate-loops": "js-plugin",
	"unicorn/no-duplicate-set-values": "js-plugin",
	"unicorn/no-error-property-assignment": "js-plugin",
	"unicorn/no-exports-in-scripts": "js-plugin",
	"unicorn/no-for-loop": "js-plugin",
	"unicorn/no-global-object-property-assignment": "js-plugin",
	"unicorn/no-impossible-length-comparison": "js-plugin",
	"unicorn/no-incorrect-template-string-interpolation": "js-plugin",
	"unicorn/no-invalid-character-comparison": "js-plugin",
	"unicorn/no-invalid-well-known-symbol-methods": "js-plugin",
	"unicorn/no-keyword-prefix": "js-plugin",
	"unicorn/no-loop-iterable-mutation": "js-plugin",
	"unicorn/no-mismatched-map-key": "js-plugin",
	"unicorn/no-misrefactored-assignment": "js-plugin",
	"unicorn/no-negated-array-predicate": "js-plugin",
	"unicorn/no-object-methods-with-collections": "js-plugin",
	"unicorn/no-optional-chaining-on-undeclared-variable": "js-plugin",
	"unicorn/no-redundant-comparison": "js-plugin",
	"unicorn/no-return-array-push": "js-plugin",
	"unicorn/no-subtraction-comparison": "js-plugin",
	"unicorn/no-unnecessary-fetch-options": "js-plugin",
	"unicorn/no-unnecessary-global-this": "js-plugin",
	"unicorn/no-unreadable-for-of-expression": "js-plugin",
	"unicorn/no-unreadable-new-expression": "js-plugin",
	"unicorn/no-unsafe-property-key": "js-plugin",
	"unicorn/no-unused-properties": "js-plugin",
	"unicorn/no-useless-coercion": "js-plugin",
	"unicorn/no-useless-compound-assignment": "js-plugin",
	"unicorn/no-useless-concat": "js-plugin",
	"unicorn/no-useless-delete-check": "js-plugin",
	"unicorn/no-useless-logical-operand": "js-plugin",
	"unicorn/no-useless-recursion": "js-plugin",
	"unicorn/no-xor-as-exponentiation": "js-plugin",
	"unicorn/operator-assignment": "js-plugin",
	"unicorn/prefer-abort-signal-any": "js-plugin",
	"unicorn/prefer-array-from-map": "js-plugin",
	"unicorn/prefer-array-from-range": "js-plugin",
	"unicorn/prefer-array-iterable-methods": "js-plugin",
	"unicorn/prefer-array-slice": "js-plugin",
	"unicorn/prefer-block-statement-over-iife": "js-plugin",
	"unicorn/prefer-continue": "js-plugin",
	"unicorn/prefer-direct-iteration": "js-plugin",
	"unicorn/prefer-else-if": "js-plugin",
	"unicorn/prefer-flat-math-min-max": "js-plugin",
	"unicorn/prefer-global-number-constants": "js-plugin",
	"unicorn/prefer-group-by": "js-plugin",
	"unicorn/prefer-has-check": "js-plugin",
	"unicorn/prefer-hoisting-branch-code": "js-plugin",
	"unicorn/prefer-identifier-import-export-specifiers": "js-plugin",
	"unicorn/prefer-iterator-helpers": "js-plugin",
	"unicorn/prefer-math-constants": "js-plugin",
	"unicorn/prefer-simple-condition-first": "js-plugin",
	"unicorn/prefer-simplified-conditions": "js-plugin",
	"unicorn/prefer-split-limit": "js-plugin",
	"unicorn/prefer-string-match-all": "js-plugin",
	"unicorn/prefer-string-pad-start-end": "js-plugin",
	"unicorn/prefer-string-repeat": "js-plugin",
	"unicorn/prefer-switch": "js-plugin",
	"unicorn/prefer-unary-minus": "js-plugin",
	"unicorn/require-passive-events": "js-plugin",

	// Part: Imports (import-lite; native ports)
	"import/first": "native",
	"import/newline-after-import": "native",
	"import/no-duplicates": "native",
	"import/no-mutable-exports": "native",
	"import/no-named-default": "native",

	// Part: Promise (native)
	"promise/always-return": "native",
	"promise/catch-or-return": "native",
	"promise/no-multiple-resolved": "native",
	"promise/no-nesting": "native",
	"promise/no-promise-in-callback": "native",
	"promise/no-return-in-finally": "native",
	"promise/no-return-wrap": "native",
	"promise/param-names": "native",

	// Part: JSDoc (native)
	"jsdoc/check-access": "native",
	"jsdoc/check-property-names": "native",
	"jsdoc/empty-tags": "native",
	"jsdoc/implements-on-classes": "native",
	"jsdoc/no-defaults": "native",
	"jsdoc/require-param": "native",
	"jsdoc/require-param-description": "native",
	"jsdoc/require-param-name": "native",
	"jsdoc/require-property": "native",
	"jsdoc/require-property-description": "native",
	"jsdoc/require-property-name": "native",
	"jsdoc/require-returns": "native",
	"jsdoc/require-returns-description": "native",

	// Part: JSDoc (run via jsPlugin)
	"jsdoc/check-alignment": "js-plugin",
	"jsdoc/check-param-names": "js-plugin",
	"jsdoc/check-types": "js-plugin",
	"jsdoc/convert-to-jsdoc-comments": "js-plugin",
	"jsdoc/informative-docs": "js-plugin",
	"jsdoc/multiline-blocks": "js-plugin",
	"jsdoc/no-blank-block-descriptions": "js-plugin",
	"jsdoc/no-blank-blocks": "js-plugin",
	"jsdoc/no-multi-asterisks": "js-plugin",
	"jsdoc/no-types": "js-plugin",
	"jsdoc/no-undefined-types": "js-plugin",
	"jsdoc/require-asterisk-prefix": "js-plugin",
	"jsdoc/require-description": "js-plugin",
	"jsdoc/require-description-complete-sentence": "js-plugin",
	"jsdoc/require-hyphen-before-param-description": "js-plugin",
	"jsdoc/require-rejects": "js-plugin",
	"jsdoc/require-returns-check": "js-plugin",
	"jsdoc/require-template": "js-plugin",
	"jsdoc/require-yields-check": "js-plugin",

	// Part: Node (native)
	"node/handle-callback-err": "native",
	"node/no-exports-assign": "native",
	"node/no-new-require": "native",
	"node/no-path-concat": "native",

	// Part: Node (run via jsPlugin)
	"node/no-deprecated-api": "js-plugin",
	"node/prefer-global/buffer": "js-plugin",
	"node/prefer-global/process": "js-plugin",
	"node/prefer-node-protocol": "js-plugin",
	"node/process-exit-as-throw": "js-plugin",

	// Part: SonarJS (run via jsPlugin)
	"sonar/bool-param-default": "js-plugin",
	"sonar/cognitive-complexity": "js-plugin",
	"sonar/constructor-for-side-effects": "js-plugin",
	"sonar/destructuring-assignment-syntax": "js-plugin",
	"sonar/file-name-differ-from-class": "js-plugin",
	"sonar/fixme-tag": "js-plugin",
	"sonar/max-switch-cases": "js-plugin",
	"sonar/misplaced-loop-counter": "js-plugin",
	"sonar/no-all-duplicated-branches": "js-plugin",
	"sonar/no-async-constructor": "js-plugin",
	"sonar/no-collapsible-if": "js-plugin",
	"sonar/no-dead-store": "js-plugin",
	"sonar/no-duplicate-string": "js-plugin",
	"sonar/no-duplicated-branches": "js-plugin",
	"sonar/no-element-overwrite": "js-plugin",
	"sonar/no-empty-collection": "js-plugin",
	"sonar/no-identical-conditions": "js-plugin",
	"sonar/no-identical-expressions": "js-plugin",
	"sonar/no-identical-functions": "js-plugin",
	"sonar/no-inverted-boolean-check": "js-plugin",
	"sonar/no-nested-conditional": "js-plugin",
	"sonar/no-nested-incdec": "js-plugin",
	"sonar/no-nested-switch": "js-plugin",
	"sonar/no-nested-template-literals": "js-plugin",
	"sonar/no-parameter-reassignment": "js-plugin",
	"sonar/no-redundant-boolean": "js-plugin",
	"sonar/no-redundant-jump": "js-plugin",
	"sonar/no-unthrown-error": "js-plugin",
	"sonar/no-unused-collection": "js-plugin",
	"sonar/no-use-of-empty-return-value": "js-plugin",
	"sonar/no-useless-catch": "js-plugin",
	"sonar/no-useless-increment": "js-plugin",
	"sonar/non-existent-operator": "js-plugin",
	"sonar/prefer-immediate-return": "js-plugin",
	"sonar/prefer-object-literal": "js-plugin",
	"sonar/prefer-promise-shorthand": "js-plugin",
	"sonar/prefer-single-boolean-return": "js-plugin",
	"sonar/prefer-while": "js-plugin",
	"sonar/public-static-readonly": "js-plugin",
	"sonar/todo-tag": "js-plugin",
	"sonar/use-type-alias": "js-plugin",

	// Part: Perfectionist (run via jsPlugin)
	"perfectionist/sort-array-includes": "js-plugin",
	"perfectionist/sort-classes": "js-plugin",
	"perfectionist/sort-decorators": "js-plugin",
	"perfectionist/sort-enums": "js-plugin",
	"perfectionist/sort-exports": "js-plugin",
	"perfectionist/sort-heritage-clauses": "js-plugin",
	"perfectionist/sort-interfaces": "js-plugin",
	"perfectionist/sort-intersection-types": "js-plugin",
	"perfectionist/sort-jsx-props": "js-plugin",
	"perfectionist/sort-maps": "js-plugin",
	"perfectionist/sort-modules": "js-plugin",
	"perfectionist/sort-named-imports": "js-plugin",
	"perfectionist/sort-object-types": "js-plugin",
	"perfectionist/sort-objects": "js-plugin",
	"perfectionist/sort-sets": "js-plugin",
	"perfectionist/sort-switch-case": "js-plugin",
	"perfectionist/sort-union-types": "js-plugin",
	"perfectionist/sort-variable-declarations": "js-plugin",

	// Part: Spelling (run via jsPlugin)
	"@cspell/spellchecker": "js-plugin",

	// Part: Antfu / small plugins (run via jsPlugin)
	"antfu/import-dedupe": "js-plugin",
	"antfu/no-import-dist": "js-plugin",
	"antfu/no-import-node-modules-by-path": "js-plugin",
	"antfu/no-top-level-await": "js-plugin",
	"antfu/top-level-function": "js-plugin",
	"better-max-params/better-max-params": "js-plugin",
	"de-morgan/no-negated-conjunction": "js-plugin",
	"de-morgan/no-negated-disjunction": "js-plugin",
	"unused-imports/no-unused-imports": "js-plugin",
	"unused-imports/no-unused-vars": "js-plugin",

	// Part: Stylistic (run via jsPlugin)
	"arrow-style/arrow-return-style": "js-plugin",
	"style/lines-between-class-members": "js-plugin",
	"style/multiline-comment-style": "js-plugin",
	"style/object-property-newline": "js-plugin",
	"style/padding-line-between-statements": "js-plugin",
	"style/quotes": "js-plugin",
	"style/spaced-comment": "js-plugin",

	// Part: Comment length (run via jsPlugin)
	"comment-length/limit-single-line-comments": "js-plugin",

	// Part: Cease-nonsense (run via jsPlugin; prefer-read-only-props is
	// type-aware and stays in ESLint)
	"cease-nonsense/no-array-constructor-elements": "js-plugin",
	"cease-nonsense/no-array-size-assignment": "js-plugin",
	"cease-nonsense/no-commented-code": "js-plugin",
	"cease-nonsense/prefer-class-properties": "js-plugin",
	"cease-nonsense/prefer-early-return": "js-plugin",
	"cease-nonsense/prefer-module-scope-constants": "js-plugin",
	"cease-nonsense/prefer-singular-enums": "js-plugin",
	"cease-nonsense/strict-component-boundaries": "js-plugin",

	// Part: Roblox (run via jsPlugin; the type-aware roblox rules stay in
	// ESLint)
	"roblox/no-any": "js-plugin",
	"roblox/no-enum-merging": "js-plugin",
	"roblox/no-export-assignment-let": "js-plugin",
	"roblox/no-for-in": "js-plugin",
	"roblox/no-function-expression-name": "js-plugin",
	"roblox/no-get-set": "js-plugin",
	"roblox/no-implicit-self": "js-plugin",
	"roblox/no-invalid-identifier": "js-plugin",
	"roblox/no-namespace-merging": "js-plugin",
	"roblox/no-null": "js-plugin",
	"roblox/no-private-identifier": "js-plugin",
	"roblox/no-unsupported-syntax": "js-plugin",
	"roblox/no-user-defined-lua-tuple": "js-plugin",
	"roblox/no-value-typeof": "js-plugin",
	"roblox/prefer-get-players": "js-plugin",
	"roblox/prefer-task-library": "js-plugin",
	"sentinel/prefer-math-min-max": "js-plugin",

	// Part: ESLint plugin development (run via jsPlugin)
	"eslint-plugin/consistent-output": "js-plugin",
	"eslint-plugin/fixer-return": "js-plugin",
	"eslint-plugin/no-deprecated-context-methods": "js-plugin",
	"eslint-plugin/no-deprecated-report-api": "js-plugin",
	"eslint-plugin/no-identical-tests": "js-plugin",
	"eslint-plugin/no-matching-violation-suggest-message-ids": "js-plugin",
	"eslint-plugin/no-meta-replaced-by": "js-plugin",
	"eslint-plugin/no-meta-schema-default": "js-plugin",
	"eslint-plugin/no-missing-message-ids": "js-plugin",
	"eslint-plugin/no-missing-placeholders": "js-plugin",
	"eslint-plugin/no-only-tests": "js-plugin",
	"eslint-plugin/no-unused-message-ids": "js-plugin",
	"eslint-plugin/no-unused-placeholders": "js-plugin",
	"eslint-plugin/no-useless-token-range": "js-plugin",
	"eslint-plugin/prefer-message-ids": "js-plugin",
	"eslint-plugin/prefer-object-rule": "js-plugin",
	"eslint-plugin/prefer-output-null": "js-plugin",
	"eslint-plugin/prefer-placeholders": "js-plugin",
	"eslint-plugin/prefer-replace-text": "js-plugin",
	"eslint-plugin/report-message-format": "js-plugin",
	"eslint-plugin/require-meta-default-options": "js-plugin",
	"eslint-plugin/require-meta-docs-description": "js-plugin",
	"eslint-plugin/require-meta-docs-recommended": "js-plugin",
	"eslint-plugin/require-meta-fixable": "js-plugin",
	"eslint-plugin/require-meta-has-suggestions": "js-plugin",
	"eslint-plugin/require-meta-schema": "js-plugin",
	"eslint-plugin/require-meta-schema-description": "js-plugin",
	"eslint-plugin/require-meta-type": "js-plugin",
	"eslint-plugin/require-test-case-name": "js-plugin",
	"eslint-plugin/require-test-error-positions": "js-plugin",
	"eslint-plugin/test-case-property-ordering": "js-plugin",
	"eslint-plugin/test-case-shorthand-strings": "js-plugin",
	"eslint-plugin/unique-test-case-names": "js-plugin",

	// Part: Erasable syntax only (run via jsPlugin)
	"erasable-syntax-only/enums": "js-plugin",
	"erasable-syntax-only/import-aliases": "js-plugin",
	"erasable-syntax-only/namespaces": "js-plugin",
	"erasable-syntax-only/parameter-properties": "js-plugin",
};

/**
 * Type-aware ESLint rules (meta.docs.requiresTypeChecking) that our shared
 * rule maps reference. Oxlint jsPlugins have no type information, so these
 * rules crash (e.g. Eslint-plugin-jest throws) or silently no-op (e.g.
 * Eslint-plugin-sonarjs skips) when run inside oxlint. The oxlint factory
 * must never emit them; in hybrid mode they stay in ESLint.
 *
 * A test asserts (against the plugins' runtime metadata) that no rule
 * emitted as a jsPlugin requires type checking.
 */
export const typeAwareJsPluginRules: ReadonlySet<string> = new Set([
	"arrow-style/no-export-default-arrow",
	"eslint-plugin/no-property-in-node",
	"sonar/no-ignored-return",
	"sonar/no-redundant-optional",
	"sonar/no-try-promise",
	"test/no-error-equal",
	"test/no-unnecessary-assertion",
	"test/unbound-method",
	"test/valid-expect-with-promise",
	"unicorn/no-non-function-verb-prefix",
]);

/**
 * Rules that must not run inside oxlint at all (even in standalone mode)
 * because they misbehave under oxlint's jsPlugin runtime. See
 * {@link staysInEslint} for the reasons.
 */
export const excludedFromOxlint: ReadonlySet<string> = new Set([
	"unicorn/no-unsafe-string-replacement",
	...typeAwareJsPluginRules,
]);

/**
 * TypeScript extension rules that map to oxlint's core (TypeScript-aware)
 * implementations.
 */
const TS_EXTENSION_TO_CORE = new Set([
	"default-param-last",
	"no-empty-function",
	"no-shadow",
	"no-unused-expressions",
	"no-unused-private-class-members",
	"no-useless-constructor",
	"prefer-destructuring",
]);

/** Unicorn rules renamed in eslint-plugin-unicorn v70 but not (yet) in oxlint. */
const UNICORN_NATIVE_RENAMES: Readonly<Record<string, string>> = {
	"no-for-each": "no-array-for-each",
};

/**
 * Prefix translation for rules that run via jsPlugins. Native oxlint plugin
 * prefixes are reserved, so those jsPlugins use `-js` aliases.
 */
const JS_PLUGIN_PREFIX_RENAMES: Readonly<Record<string, string>> = {
	"": "eslint-js",
	"import": "import-js",
	"jsdoc": "jsdoc-js",
	"node": "node-js",
	"promise": "promise-js",
	"react": "react-x",
	"unicorn": "unicorn-js",
	"vitest": "vitest-js",
};

/** JsPlugin package specifiers keyed by their oxlint-side prefix. */
export const oxlintJsPlugins: Readonly<Record<string, string>> = {
	"@cspell": "@cspell/eslint-plugin",
	"antfu": "eslint-plugin-antfu",
	"arrow-style": "eslint-plugin-arrow-return-style-x",
	"better-max-params": "eslint-plugin-better-max-params",
	"cease-nonsense": "@pobammer-ts/eslint-cease-nonsense-rules",
	"comment-length": "eslint-plugin-comment-length",
	"de-morgan": "eslint-plugin-de-morgan",
	"erasable-syntax-only": "eslint-plugin-erasable-syntax-only",
	"eslint-js": "oxlint-plugin-eslint",
	"eslint-plugin": "eslint-plugin-eslint-plugin",
	"flawless": "eslint-plugin-flawless",
	"import-js": "eslint-plugin-import-lite",
	"jest-extended": "eslint-plugin-jest-extended",
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
	"sonar": "eslint-plugin-sonarjs",
	"style": "@stylistic/eslint-plugin",
	"test": "eslint-plugin-jest",
	"ts": "@typescript-eslint/eslint-plugin",
	"unicorn-js": "eslint-plugin-unicorn",
	"unused-imports": "eslint-plugin-unused-imports",
	"vitest-js": "@vitest/eslint-plugin",
} as const;

/**
 * Whether the given ESLint rule (canonical renamed name) is covered by oxlint
 * in hybrid mode.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether oxlint covers the rule.
 */
export function isOxlintCovered(rule: string): boolean {
	return rule in oxlintRuleMapping;
}

/**
 * Whether the rule runs via oxlint-tsgolint (`oxlint --type-aware`); such rules
 * are noise without type information, so they are gated on `typeAware`.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is executed by oxlint-tsgolint.
 */
export function isTsgolintRule(rule: string): boolean {
	return oxlintRuleMapping[rule] === "tsgolint";
}

/**
 * Translate a canonical ESLint rule name into its oxlint configuration name.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns The rule name to use in an oxlint configuration.
 */
export function translateRuleToOxlint(rule: string): string {
	const target = oxlintRuleMapping[rule];
	const { name, prefix } = splitRuleName(rule);

	if (target === "native") {
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

	if (target === "tsgolint") {
		return `typescript/${name}`;
	}

	// js-plugin (or unmapped rules used by the standalone factory, which keep
	// their prefix)
	const renamed = JS_PLUGIN_PREFIX_RENAMES[prefix];
	return renamed === undefined ? rule : `${renamed}/${name}`;
}

/**
 * Whether a rule is a TypeScript extension rule that oxlint implements as its
 * TypeScript-aware core rule, so `ts/<name>` and the bare core `<name>`
 * collapse onto a single native entry. The extension entry must win.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule collapses onto a shared native core rule.
 */
export function collapsesToTsCoreRule(rule: string): boolean {
	const { name, prefix } = splitRuleName(rule);
	return prefix === "ts" && TS_EXTENSION_TO_CORE.has(name);
}

/**
 * Whether a rule is the bare core counterpart of a collapsing TypeScript
 * extension rule; its severity must yield to the extension entry.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is such a core counterpart.
 */
export function isTsCoreCounterpartRule(rule: string): boolean {
	const { name, prefix } = splitRuleName(rule);
	return prefix === "" && TS_EXTENSION_TO_CORE.has(name);
}

function splitRuleName(rule: string): { name: string; prefix: string } {
	const slashIndex = rule.indexOf("/");
	if (slashIndex === -1) {
		return { name: rule, prefix: "" };
	}

	return { name: rule.slice(slashIndex + 1), prefix: rule.slice(0, slashIndex) };
}
