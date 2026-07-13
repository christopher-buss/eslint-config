import { GLOB_MISE, GLOB_YAML } from "../../globs.ts";
import { interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types.ts";

/**
 * Sort GitHub Actions workflow files.
 *
 * Requires `yaml` config.
 *
 * @returns An array of flat configuration items.
 */
export function sortGithubAction(): Array<TypedFlatConfigItem> {
	/* oxlint-disable sonar/no-duplicate-string -- GitHub Actions property names repeated in different ordering contexts. */
	return [
		{
			name: "isentinel/sort/github-actions",
			files: [`.github/workflows/${GLOB_YAML}`],
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
						pathPattern: "^jobs\\.[^.]+\\.steps\\[\\d+\\]$",
					},
					// With
					{
						order: ["args", "entrypoint"],
						pathPattern: "^jobs\\.[^.]+\\.steps\\[\\d+\\]\\.with$",
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
				"yaml/sort-sequence-values": [
					"error",
					// Trigger events
					{
						order: { natural: true, type: "asc" },
						pathPattern: "^on$",
					},
					// Branch/tag/path filters and event types
					{
						order: { natural: true, type: "asc" },
						pathPattern:
							"^on\\.[^.]+\\.(branches|branches-ignore|tags|tags-ignore|paths|paths-ignore|types)$",
					},
					// Job dependencies
					{
						order: { natural: true, type: "asc" },
						pathPattern: "^jobs\\.[^.]+\\.needs$",
					},
				],
			},
		},
		{
			name: "isentinel/sort/github-composite-actions",
			files: [`.github/actions/${GLOB_YAML}`],
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
						pathPattern: "^runs\\.steps\\[\\d+\\]$",
					},
					// General nested key sorting for everything else
					{
						order: { type: "asc" },
						pathPattern:
							"^(?!^$|inputs\\.[^.]+$|outputs\\.[^.]+$|runs$|runs\\.steps\\[\\d+\\]$).*$",
					},
				],
			},
		},
	];
	/* oxlint-enable sonar/no-duplicate-string */
}

/**
 * Sort mise configuration files by category.
 *
 * Requires `toml` config (for the parser) and `eslint-plugin-flawless`.
 *
 * @returns A promise resolving to an array of flat configuration items.
 */
export async function sortMiseToml(): Promise<Array<TypedFlatConfigItem>> {
	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	return [
		{
			name: "isentinel/sort/mise-toml",
			files: [...GLOB_MISE],
			plugins: {
				flawless: eslintPluginFlawless,
			},
			rules: {
				"flawless/toml-sort-keys": [
					"error",
					{
						order: [
							"env",
							"vars",
							"settings",
							"tools",
							"tasks",
							"task_config",
							"alias",
							"plugins",
							"redactions",
							"hooks",
							"watch_files",
						],
						pathPattern: "^$",
					},
					{
						order: [
							// Core behavior
							"experimental",
							"activate_aggressive",
							"auto_install",
							"auto_install_disable_tools",
							"auto_env",
							"offline",
							"prefer_offline",
							"quiet",
							"silent",
							"verbose",

							// Environment and paths
							"env_file",
							"env_cache",
							"env_cache_ttl",
							"env_shell_expand",
							"no_env",
							"no_hooks",

							// Installation and binaries
							"all_compile",
							"always_keep_download",
							"always_keep_install",
							"arch",
							"libc",
							"os",
							"jobs",

							// Configuration files
							"ceiling_paths",
							"default_config_filename",
							"default_tool_versions_filename",
							"global_config_file",
							"global_config_root",
							"override_config_filenames",
							"override_tool_versions_filenames",
							"ignored_config_paths",
							"trusted_config_paths",

							// Lockfiles and versioning
							"lockfile",
							"lockfile_platforms",
							"locked",
							"locked_verify_provenance",
							"minimum_release_age",
							"minimum_release_age_excludes",
							"pin",
							"prereleases",

							// Security and verification
							"paranoid",
							"gpg_verify",
							"github_attestations",
							"slsa",
							"netrc",
							"netrc_file",
							"provenance_api_failures_fatal",

							// Display and interaction
							"color",
							"color_theme",
							"yes",
							"raw",
							"terminal_progress",

							// Caching and performance
							"cache_prune_age",
							"fetch_remote_versions_cache",
							"fetch_remote_versions_timeout",
							"http_timeout",
							"http_retries",

							// Version sources and registries
							"use_versions_host",
							"use_versions_host_track",
							"disable_default_registry",
							"url_replacements",

							// Shell configuration
							"unix_default_file_shell_args",
							"unix_default_inline_shell_args",
							"windows_default_file_shell_args",
							"windows_default_inline_shell_args",
							"windows_executable_extensions",
							"windows_shim_mode",
							"use_file_shell_for_executable_tasks",

							// Hints and tool toggles
							"disable_hints",
							"disable_tools",
							"enable_tools",
						],
						pathPattern: "^settings$",
					},
					{
						order: { natural: true, type: "asc" },
						pathPattern: "^settings\\.[^.]+$",
					},
					{
						order: { natural: true, type: "asc" },
						pathPattern: "^tools$",
					},
				],
				"toml/keys-order": "off",
				"toml/tables-order": "off",
			},
		},
	];
}

export function sortPnpmWorkspace(): Array<TypedFlatConfigItem> {
	return [
		{
			name: "isentinel/sort/pnpm-workspace-yaml-sort",
			files: ["pnpm-workspace.yaml"],
			rules: {
				"yaml/sort-keys": [
					"error",
					{
						order: [
							// Settings
							...[
								"autoInstallPeers",
								"blockExoticSubdeps",
								"cacheDir",
								"catalogMode",
								"cleanupUnusedCatalogs",
								"dedupeDirectDeps",
								"dedupePeerDependents",
								"dedupePeers",
								"deployAllFiles",
								"enablePrePostScripts",
								"engineStrict",
								"extendNodePath",
								"hoist",
								"hoistPattern",
								"hoistWorkspacePackages",
								"hoistingLimits",
								"ignoreCompatibilityDb",
								"ignoreDepScripts",
								"ignoreScripts",
								"ignoreWorkspaceRootCheck",
								"ignoredWorkspaceGlobs",
								"includeWorkspaceRoot",
								"injectWorkspacePackages",
								"linkWorkspacePackages",
								"managePackageManagerVersions",
								"minimumReleaseAge",
								"minimumReleaseAgeExclude",
								"minimumReleaseAgeIgnoreMissingTime",
								"minimumReleaseAgeStrict",
								"modulesDir",
								"nodeLinker",
								"nodeVersion",
								"optimisticRepeatInstall",
								"packageManagerStrict",
								"packageManagerStrictVersion",
								"preferSymlinkedExecutables",
								"preferWorkspacePackages",
								"publicHoistPattern",
								"registrySupportsTimeField",
								"requiredScripts",
								"resolutionMode",
								"resolvePeersFromWorkspaceRoot",
								"saveExact",
								"savePrefix",
								"saveWorkspaceProtocol",
								"scriptShell",
								"shamefullyHoist",
								"sharedWorkspaceLockfile",
								"shellEmulator",
								"stateDir",
								"strictDepBuilds",
								"strictPeerDependencies",
								"supportedArchitectures",
								"symlink",
								"tag",
								"trustLockfile",
								"trustPolicy",
								"trustPolicyExclude",
								"trustPolicyIgnoreAfter",
								"updateConfig",
								"updateNotifier",
								"verifyDepsBeforeRun",
							],

							// Lockfile
							...[
								"gitBranchLockfile",
								"lockfile",
								"lockfileIncludeTarballUrl",
								"mergeGitBranchLockfilesBranchPattern",
								"peersSuffixMaxLength",
								"preferFrozenLockfile",
							],

							// Packages and dependencies
							"packages",
							"overrides",
							"patchedDependencies",
							"catalog",
							"catalogs",

							// Other
							...[
								"allowBuilds",
								"allowNonAppliedPatches",
								"allowedDeprecatedVersions",
								"configDependencies",
								"dangerouslyAllowAllBuilds",
								"ignoredBuiltDependencies",
								"ignoredOptionalDependencies",
								"neverBuiltDependencies",
								"onlyBuiltDependencies",
								"onlyBuiltDependenciesFile",
								"packageExtensions",
								"peerDependencyRules",
							],

							// Unlisted keys: sort alphabetically, last.
							{ order: { type: "asc" } },
						],
						pathPattern: "^$",
					},
					{
						order: { type: "asc" },
						pathPattern: ".*",
					},
				],
				"yaml/sort-sequence-values": [
					"error",
					// Package and build-approval lists
					{
						order: { natural: true, type: "asc" },
						pathPattern:
							"^(packages|onlyBuiltDependencies|neverBuiltDependencies|ignoredBuiltDependencies|ignoredOptionalDependencies|ignoredWorkspaceGlobs|minimumReleaseAgeExclude|trustPolicyExclude|requiredScripts)$",
					},
					// Nested lists
					{
						order: { natural: true, type: "asc" },
						pathPattern:
							"^(supportedArchitectures\\.(cpu|libc|os)|updateConfig\\.ignoreDependencies|peerDependencyRules\\.(allowAny|ignoreMissing)|auditConfig\\.(ignoreCves|ignoreGhsas))$",
					},
				],
			},
		},
	];
}

/**
 * Sort Rojo .project.json files.
 *
 * Requires `jsonc` config.
 *
 * @returns An array of flat configuration items.
 */
export function sortRojoProject(): Array<TypedFlatConfigItem> {
	return [
		{
			name: "isentinel/sort/rojo-project",
			files: ["**/*.project.json", "**/project.json"],
			rules: {
				"jsonc/sort-keys": [
					"error",
					{
						order: [
							"name",
							"servePort",
							"servePlaceIds",
							"placeId",
							"gameId",
							"serveAddress",
							"globIgnorePaths",
							"emitLegacyScripts",
							"tree",
						],
						pathPattern: "^$",
					},
					{
						hasProperties: [
							"$className",
							"$path",
							"$properties",
							"$ignoreUnknownInstances",
						],
						order: ["$className", "$path", "$properties", "$ignoreUnknownInstances"],
						pathPattern: "^tree\\..+$",
					},
					{
						order: { type: "asc" },
						pathPattern: ".*",
					},
				],
			},
		},
	];
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
			name: "isentinel/sort-tsconfig",
			// cspell:disable-next-line
			files: ["**/[jt]sconfig.json", "**/[jt]sconfig.*.json"],
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

/**
 * Sort CSpell configuration files.
 *
 * Requires `yaml` config (for the parser).
 *
 * @returns An array of flat configuration items.
 */
export function sortCspell(): Array<TypedFlatConfigItem> {
	return [
		{
			name: "isentinel/sort/cspell",
			files: [
				"**/cspell.y{,a}ml",
				"**/cspell.config.y{,a}ml",
				"**/cspell.config.*.y{,a}ml",
				"**/.cspell.y{,a}ml",
				"**/.cspell.config.y{,a}ml",
			],
			rules: {
				"yaml/sort-sequence-values": [
					"error",
					// Word, dictionary, and path lists (root or nested)
					{
						order: { natural: true, type: "asc" },
						pathPattern:
							"^((overrides|languageSettings)\\[\\d+\\]\\.)?(words|userWords|ignoreWords|noSuggestWords|flagWords|ignorePaths|dictionaries|enableFiletypes)$",
					},
				],
			},
		},
	];
}
