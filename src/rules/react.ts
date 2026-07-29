import { isRecord } from "../guards.ts";
import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export interface ReactRuleOptions extends OptionsStylistic {
	domPackage?: string;
	filenameCase?: "kebabCase" | "pascalCase";
	reactCompiler?: boolean;
	testing?: boolean;
}

type RestrictedImportRule = NonNullable<TypedFlatConfigItem["rules"]>["no-restricted-imports"];

const DOM_IMPORT_MESSAGE =
	"Import from react-testing-library-lua instead; it re-exports the DOM utilities, and eslint-plugin-testing-library only detects one module per file.";

/**
 * Build the direct DOM Testing Library import restriction shared by both
 * engines.
 *
 * @param domPackage - Package name for DOM Testing Library.
 * @returns The configured restriction, or `undefined` when no package is set.
 */
export function restrictedDomImportRule(
	domPackage: string | undefined,
): RestrictedImportRule | undefined {
	if (domPackage === undefined) {
		return undefined;
	}

	return [
		"error",
		{
			paths: [domImportRestriction(domPackage)],
		},
	];
}

/**
 * Merge the direct DOM Testing Library restriction into an existing
 * `no-restricted-imports` entry.
 *
 * The existing entry owns the severity and any duplicate restriction. An
 * explicit disabled entry remains disabled.
 *
 * @param rule - Existing rule entry.
 * @param domPackage - Package name for DOM Testing Library.
 * @returns The composed rule entry.
 */
export function mergeRestrictedDomImportRule(
	rule: RestrictedImportRule | undefined,
	domPackage: string | undefined,
): RestrictedImportRule | undefined {
	if (domPackage === undefined || rule === "off" || rule === 0) {
		return rule;
	}

	if (rule === undefined) {
		return restrictedDomImportRule(domPackage);
	}

	const parts: Array<unknown> = Array.isArray(rule) ? [...rule] : [rule];
	const [severity, ...options] = parts;
	if (severity === "off" || severity === 0) {
		return rule;
	}

	if (severity !== "error" && severity !== "warn" && severity !== 1 && severity !== 2) {
		return rule;
	}

	const [firstOption] = options;
	if (options.length === 1 && isObjectStyleRestriction(firstOption)) {
		const paths = Array.isArray(firstOption["paths"]) ? firstOption["paths"] : [];
		if (paths.some((path) => isDomImportRestriction(path, domPackage))) {
			return rule;
		}

		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runtime checks above preserve ESLint's valid object-style rule shape.
		return [
			severity,
			{
				...firstOption,
				paths: [...paths, domImportRestriction(domPackage)],
			},
		] as RestrictedImportRule;
	}

	if (options.some((option) => isDomImportRestriction(option, domPackage))) {
		return rule;
	}

	if (options.length === 0) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a severity plus the object-style option is a valid rule entry.
		return [severity, { paths: [domImportRestriction(domPackage)] }] as RestrictedImportRule;
	}

	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- appending a path descriptor preserves ESLint's valid legacy rule shape.
	return [...parts, domImportRestriction(domPackage)] as unknown as RestrictedImportRule;
}

/**
 * React rules shared between the ESLint and oxlint factories.
 *
 * The type-aware react rules stay in the ESLint config (oxlint jsPlugins have
 * no type information).
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function reactRules({
	domPackage,
	filenameCase = "kebabCase",
	reactCompiler = true,
	stylistic = true,
	testing = false,
}: ReactRuleOptions = {}): TypedFlatConfigItem["rules"] {
	const restrictedDomImport = testing ? restrictedDomImportRule(domPackage) : undefined;

	return {
		"flawless/no-unnecessary-use-callback": "error",

		"flawless/no-unnecessary-use-memo": "error",
		"flawless/purity": "error",
		"small-rules/react-hooks-strict-return": "error",

		...(reactCompiler
			? {
					"react/globals": "error",
					"react/refs": "error",
				}
			: {}),

		// recommended rules from eslint-plugin-react-jsx
		"react-jsx/no-children-prop": "warn",
		"react-jsx/no-children-prop-with-children": "error",
		"react-jsx/no-comment-textnodes": "off",
		"react-jsx/no-key-after-spread": "error",
		"react-jsx/no-leaked-dollar": "warn",
		"react-jsx/no-leaked-semicolon": "warn",

		// recommended rules from @eslint-react
		"react/error-boundaries": "error",
		"react/exhaustive-deps": "error",
		"react/immutability": "error",
		"react/no-access-state-in-setstate": "error",
		"react/no-array-index-key": "warn",
		"react/no-children-count": "warn",
		"react/no-children-for-each": "warn",
		"react/no-children-map": "warn",
		"react/no-children-only": "warn",
		"react/no-children-to-array": "warn",
		"react/no-class-component": "error",
		"react/no-clone-element": "warn",
		"react/no-component-will-mount": "error",
		"react/no-component-will-receive-props": "error",
		"react/no-component-will-update": "error",
		"react/no-create-ref": "error",
		"react/no-direct-mutation-state": "error",
		"react/no-duplicate-key": "error",
		"react/no-forward-ref": "off",
		"react/no-missing-component-display-name": "error",
		"react/no-missing-context-display-name": "error",
		"react/no-missing-key": "error",
		"react/no-misused-capture-owner-stack": "off",
		"react/no-nested-component-definitions": "warn",
		"react/no-nested-lazy-component-declarations": "warn",
		"react/no-set-state-in-component-did-mount": "warn",
		"react/no-set-state-in-component-did-update": "warn",
		"react/no-set-state-in-component-will-update": "warn",
		"react/no-unnecessary-use-prefix": "error",
		"react/no-unsafe-component-will-mount": "error",
		"react/no-unsafe-component-will-receive-props": "error",
		"react/no-unsafe-component-will-update": "error",
		"react/no-unstable-context-value": "error",
		"react/no-unstable-default-props": [
			"error",
			{
				safeDefaultProps: [
					"Axes",
					"BrickColor",
					"CatalogSearchParams",
					"CFrame",
					"Color3",
					"ColorSequence",
					"CFrame",
					"Content",
					"DateTime",
					"DockWidgetPluginGuiInfo",
					"Enum",
					"Faces",
					"FloatCurveKey",
					"Font",
					"NumberRange",
					"NumberSequence",
					"NumberSequenceKeypoint",
					"OverlapParams",
					"Path2DControlPoint",
					"PathWaypoint",
					"PhysicalProperties",
					"Ray",
					"RaycastParams",
					"Rect",
					"Region3",
					"Region3int16",
					"RotationCurveKey",
					"SecurityCapabilities",
					"TweenInfo",
					"UDim",
					"UDim2",
					"ValueCurveKey",
					"Vector2",
					"Vector3",
					"Vector3int16",
				],
			},
		],
		"react/no-unused-class-component-members": "off",
		"react/no-unused-state": "error",
		"react/no-use-context": "off",
		"react/rules-of-hooks": "error",
		"react/set-state-in-effect": "error",
		"react/set-state-in-render": "error",
		"react/static-components": "error",
		"react/use-memo": "error",
		"react/use-state": ["error", { enforceAssignment: false, enforceSetterName: false }],

		...(testing
			? {
					"testing-library/await-async-queries": "error",
					"testing-library/await-async-utils": "error",
					"testing-library/no-await-sync-events": [
						"error",
						{ eventModules: ["fire-event"] },
					],
					"testing-library/no-await-sync-queries": "error",
					"testing-library/no-container": "error",
					"testing-library/no-debugging-utils": "error",
					"testing-library/no-manual-cleanup": "error",
					"testing-library/no-promise-in-fire-event": "error",
					"testing-library/no-render-in-lifecycle": "error",
					"testing-library/no-unnecessary-act": "error",
					"testing-library/no-wait-for-multiple-assertions": "error",
					"testing-library/no-wait-for-side-effects": "error",
					"testing-library/no-wait-for-snapshot": "error",
					"testing-library/prefer-explicit-assert": "error",
					"testing-library/prefer-find-by": "error",
					"testing-library/prefer-presence-queries": "error",
					"testing-library/prefer-query-by-disappearance": "error",
					"testing-library/prefer-screen-queries": "error",
					"testing-library/render-result-naming-convention": "error",
					...(restrictedDomImport !== undefined
						? { "no-restricted-imports": restrictedDomImport }
						: {}),
				}
			: {}),

		...(stylistic !== false
			? {
					"flawless/jsx-shorthand-boolean": "warn",
					"flawless/jsx-shorthand-fragment": "warn",
					"flawless/prefer-destructuring-assignment": "error",
					"flawless/react-namespace": "error",

					"one-var": "off",

					"react-jsx/no-useless-fragment": "warn",
					// recommended rules from
					// @eslint-react/naming-convention
					"react-naming-convention/context-name": "error",
					"react-naming-convention/ref-name": "error",
					"react/use-state": "error",
					"style/jsx-curly-brace-presence": [
						"error",
						{
							children: "never",
							propElementValues: "always",
							props: "never",
						},
					],
					"style/jsx-newline": "error",
					"style/jsx-self-closing-comp": "error",

					"unicorn/filename-case": [
						"error",
						{
							case: filenameCase,
							ignore: ["^[A-Z0-9]+\.md$"],
							multipleFileExtensions: true,
						},
					],
				}
			: {}),
	};
}

function domImportRestriction(domPackage: string): { message: string; name: string } {
	return {
		name: domPackage,
		message: DOM_IMPORT_MESSAGE,
	};
}

function isDomImportRestriction(value: unknown, domPackage: string): boolean {
	return (
		value === domPackage || (isRecord(value) && "name" in value && value["name"] === domPackage)
	);
}

function isObjectStyleRestriction(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && !("name" in value);
}
