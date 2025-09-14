import { GLOB_YAML } from "../globs";
import type { TypedFlatConfigItem } from "../types";

/**
 * Sort GitHub Actions workflow files.
 *
 * Requires `yaml` config.
 *
 * @returns An array of flat configuration items.
 */
export function sortGithubAction(): Array<TypedFlatConfigItem> {
	/* eslint-disable sonar/no-duplicate-string -- GitHub Actions property names repeated in different ordering contexts. */
	return [
		{
			files: [`.github/workflows/${GLOB_YAML}`],
			name: "isentinel/sort/github-actions",
			rules: {
				"yaml/sort-keys": [
					"error",
					{
						order: [
							"name",
							"run-name",
							"on",
							"permissions",
							"env",
							"concurrency",
							"jobs",
						],
						pathPattern: "^$",
					},
					// Job properties
					{
						order: [
							"name",
							"permissions",
							"needs",
							"if",
							"runs-on",
							"environment",
							"concurrency",
							"outputs",
							"env",
							"defaults",
							"steps",
							"timeout-minutes",
							"strategy",
							"continue-on-error",
							"container",
							"services",
							"uses",
							"with",
							"secrets",
						],
						pathPattern: "^jobs\\.[^.]+$",
					},
					// On events
					{
						order: [
							"check_run",
							"check_suite",
							"create",
							"delete",
							"deployment",
							"deployment_status",
							"discussion",
							"discussion_comment",
							"fork",
							// cspell:disable-next-line
							"gollum",
							"issue_comment",
							"issues",
							"label",
							"merge_group",
							"milestone",
							"page_build",
							"public",
							"pull_request",
							"pull_request_comment",
							"pull_request_review",
							"pull_request_review_comment",
							"pull_request_target",
							"push",
							"registry_package",
							"release",
							"repository_dispatch",
							"schedule",
							"status",
							"watch",
							"workflow_call",
							"workflow_dispatch",
							"workflow_run",
						],
						pathPattern: "^on$",
					},
					// Pull request events
					{
						order: ["branches", "branches-ignore", "paths", "paths-ignore"],
						pathPattern: "^on\\.pull_request$",
					},
					{
						order: ["branches", "branches-ignore", "paths", "paths-ignore"],
						pathPattern: "^on\\.pull_request_target$",
					},
					// Push events
					{
						order: [
							"branches",
							"tags",
							"branches-ignore",
							"tags-ignore",
							"paths",
							"paths-ignore",
						],
						pathPattern: "^on\\.push$",
					},
					// Workflow call/dispatch
					{
						order: ["inputs", "outputs", "secrets"],
						pathPattern: "^on\\.workflow_call$",
					},
					{
						order: ["inputs"],
						pathPattern: "^on\\.workflow_dispatch$",
					},
					{
						order: ["branches", "branches-ignore"],
						pathPattern: "^on\\.workflow_run$",
					},
					// Inputs
					{
						order: ["description", "required", "default", "type"],
						pathPattern: "^on\\.(workflow_call|workflow_dispatch)\\.inputs\\.[^.]+$",
					},
					// Run configuration
					{
						order: ["shell", "working-directory"],
						pathPattern: "^(defaults\\.run|jobs\\.[^.]+\\.defaults\\.run)$",
					},
					// Concurrency
					{
						order: ["group", "cancel-in-progress"],
						pathPattern: "^(concurrency|jobs\\.[^.]+\\.concurrency)$",
					},
					// Jobs
					{
						order: [
							"name",
							"permissions",
							"needs",
							"if",
							"runs-on",
							"environment",
							"concurrency",
							"outputs",
							"env",
							"defaults",
							"steps",
							"timeout-minutes",
							"strategy",
							"continue-on-error",
							"container",
							"services",
							"uses",
							"with",
							"secrets",
						],
						pathPattern: "^jobs\\. [^.]+$",
					},
					// Steps
					{
						order: [
							"id",
							"if",
							"name",
							"uses",
							"run",
							"working-directory",
							"with",
							"env",
							"continue-on-error",
							"timeout-minutes",
						],
						pathPattern: "^jobs\\.[^.]+\\.steps\\.[^.]+$",
					},
					// With
					{
						order: ["args", "entrypoint"],
						pathPattern: "^jobs\\.[^.]+\\.steps\\.[^.]+\\.with$",
					},
					// Strategy
					{
						order: ["matrix", "fail-fast", "max-parallel"],
						pathPattern: "^jobs\\.[^.]+\\.strategy$",
					},
					// Matrix
					{
						order: ["include", "exclude"],
						pathPattern: "^jobs\\.[^.]+\\.strategy\\.matrix$",
					},
					// Container
					{
						order: ["image", "credentials", "env", "ports", "volumes", "options"],
						pathPattern: "^jobs\\.[^.]+\\.container$",
					},
					// Services
					{
						order: ["image", "credentials", "env", "ports", "volumes", "options"],
						pathPattern: "^jobs\\.[^.]+\\.services\\.[^.]+$",
					},

					// General nested key sorting for everything else
					{
						order: { type: "asc" },
						pathPattern:
							"^(?!$|on$|jobs\\.[^.]+$|on\\.(pull_request|pull_request_target|push|workflow_call|workflow_dispatch|workflow_run)$).*",
					},
				],
			},
		},
		{
			files: [`.github/actions/${GLOB_YAML}`],
			name: "isentinel/sort/github-composite-actions",
			rules: {
				"yaml/sort-keys": [
					"error",
					// Composite action root
					{
						order: ["name", "description", "inputs", "outputs", "runs"],
						pathPattern: "^$",
					},
					// Composite inputs
					{
						order: ["description", "required", "default"],
						pathPattern: "^inputs\\.[^.]+$",
					},
					// Composite outputs
					{
						order: ["description", "value"],
						pathPattern: "^outputs\\.[^.]+$",
					},
					// Composite runs
					{
						order: ["using", "steps"],
						pathPattern: "^runs$",
					},
					// Composite steps
					{
						order: [
							"id",
							"if",
							"name",
							"uses",
							"run",
							"working-directory",
							"with",
							"env",
							"shell",
							"continue-on-error",
							"timeout-minutes",
						],
						pathPattern: "^runs\\.steps\\.[^.]+$",
					},
					// General nested key sorting for everything else
					{
						order: { type: "asc" },
						pathPattern:
							"^(?!^$|inputs\\.[^.]+$|outputs\\.[^.]+$|runs$|runs\\.steps\\.[^.]+$).*",
					},
				],
			},
		},
	];
	/* eslint-enable sonar/no-duplicate-string*/
}

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
							"isolatedDeclarations",
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
