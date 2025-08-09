import type { TypedFlatConfigItem } from "../types";

/**
 * Sort tsconfig.json.
 *
 * Requires `jsonc` config.
 *
 * @returns An array of flat configuration items.
 */
export function sortTsconfig(): Array<TypedFlatConfigItem> {
	return [
		{
			// cspell:disable-next-line
			files: ["**/[jt]sconfig.json", "**/[jt]sconfig.*.json"],
			name: "isentinel/sort-tsconfig",
			rules: {
				"jsonc/sort-keys": [
					"error",
					{
						order: [
							"extends",
							"compilerOptions",
							"references",
							"files",
							"include",
							"exclude",
						],
						pathPattern: "^$",
					},
					{
						order: [
							/* Projects */
							"incremental",
							"composite",
							"tsBuildInfoFile",
							"disableSourceOfProjectReferenceRedirect",
							"disableSolutionSearching",
							"disableReferencedProjectLoad",
							/* Language and Environment */
							"target",
							"jsx",
							"jsxFactory",
							"jsxFragmentFactory",
							"jsxImportSource",
							"lib",
							"moduleDetection",
							"noLib",
							"reactNamespace",
							"useDefineForClassFields",
							"emitDecoratorMetadata",
							"experimentalDecorators",
							"libReplacement",
							/* Modules */
							"baseUrl",
							"rootDir",
							"rootDirs",
							"customConditions",
							"module",
							"moduleResolution",
							"moduleSuffixes",
							"noResolve",
							"paths",
							"resolveJsonModule",
							"resolvePackageJsonExports",
							"resolvePackageJsonImports",
							"typeRoots",
							"types",
							"allowArbitraryExtensions",
							"allowImportingTsExtensions",
							"allowUmdGlobalAccess",
							/* JavaScript Support */
							"allowJs",
							"checkJs",
							"maxNodeModuleJsDepth",
							/* Type Checking */
							"strict",
							"strictBindCallApply",
							"strictFunctionTypes",
							"strictNullChecks",
							"strictPropertyInitialization",
							"allowUnreachableCode",
							"allowUnusedLabels",
							"alwaysStrict",
							"exactOptionalPropertyTypes",
							"noFallthroughCasesInSwitch",
							"noImplicitAny",
							"noImplicitOverride",
							"noImplicitReturns",
							"noImplicitThis",
							"noPropertyAccessFromIndexSignature",
							"noUncheckedIndexedAccess",
							"noUnusedLocals",
							"noUnusedParameters",
							"useUnknownInCatchVariables",
							/* Emit */
							"declaration",
							"declarationDir",
							"declarationMap",
							"downlevelIteration",
							"emitBOM",
							"emitDeclarationOnly",
							"importHelpers",
							"importsNotUsedAsValues",
							"inlineSourceMap",
							"inlineSources",
							"mapRoot",
							"newLine",
							"noEmit",
							"noEmitHelpers",
							"noEmitOnError",
							"outDir",
							"outFile",
							"preserveConstEnums",
							"preserveValueImports",
							"removeComments",
							"sourceMap",
							"sourceRoot",
							"stripInternal",
							/* Interop Constraints */
							"allowSyntheticDefaultImports",
							"esModuleInterop",
							"forceConsistentCasingInFileNames",
							"isolatedModules",
							"preserveSymlinks",
							"verbatimModuleSyntax",
							"erasableSyntaxOnly",
							/* Completeness */
							"skipDefaultLibCheck",
							"skipLibCheck",
						],
						pathPattern: "^compilerOptions$",
					},
				],
			},
		},
	];
}
