## Project Overview

This is `@isentinel/eslint-config`, an opinionated ESLint flat config preset
designed primarily for roblox-ts projects. It's inspired by antfu/eslint-config
and provides a comprehensive set of linting rules with automatic plugin
renaming, spell checking (CSpell), and formatting via oxfmt.

## Environment

Read the required versions from `package.json` rather than duplicating them
here:

- Node.js — the `engines.node` range
- pnpm — the `packageManager` field (auto-managed by corepack)

## Commands

```bash
pnpm build      # Build (runs typegen first)
pnpm lint       # Run oxlint and ESLint concurrently
pnpm test       # Run tests (runs typegen first)
pnpm test:watch # Tests in watch mode
pnpm typecheck  # Type checking
pnpm gen        # Generate types + version constants (see Type Generation)
pnpm watch      # Watch mode
pnpm dev        # View rules in browser inspector
pnpm release    # Bump version and publish (uses bumpp; see Releasing)
```

## Workflow

- **After modifying configs**: Always run `pnpm gen` to update type definitions
- **Pre-commit hooks** (via hk, see `hk.pkl`): Runs guards, eslint, typecheck
  and tests
- **Conventional commits**: Use `feat:`, `fix:`, `chore:`, etc.
- Do not create a new branch for every PR unless asked. Default to committing
  directly to `main`.

## Releasing

This is a two-package workspace: the preset, and
`@isentinel/pnpm-plugin-eslint-config` in `pnpm-plugin/` (see
`pnpm-plugin/extensions.mjs`).

`pnpm release` runs `bumpp -r`, which sets **both** manifests to the same new
version, so the plugin tracks the preset. Pushing the resulting `v*` tag runs
`.github/workflows/release.yaml`, which publishes with
`pnpm -r publish --access public`. The preset builds through its own `prepack`;
the plugin ships its `.mjs` files as they are.

The `-r` matters: `pnpm publish` skips any package whose version is already on
the registry, so bumping only the root would publish the preset, silently skip
the plugin, and leave consumers on the old table.

Consumers pin the plugin as a config dependency at an exact version plus an
integrity hash, so they pick up a new table by running
`pnpm add --config @isentinel/pnpm-plugin-eslint-config@<version>`. The version
bump is the only signal they get: the lockfile's `pnpmfileChecksum` covers
`pnpmfile.mjs` alone, which never changes.

## Architecture

### Entry Point & Factory Pattern

The main export is `isentinel()` in `src/eslint/factory.ts` - a factory function
that composes ESLint flat configs based on options. `src/oxlint/factory.ts` is
its synchronous counterpart for oxlint:

```ts
export default isentinel({
	react: false, // Requires peer deps
	roblox: true, // Enable roblox-ts rules (default: true)
	test: false, // Jest/Vitest support, requires peer deps
	type: "game", // "game" | "package" - affects rule strictness
});
```

The factory uses `eslint-flat-config-utils`'s `FlatConfigComposer` to merge
configs and supports automatic plugin renaming (e.g., `@typescript-eslint/*` →
`ts/*`).

### Config Modules (`src/eslint/configs/`)

Each file exports a function returning `TypedFlatConfigItem[]`. Key configs:

- `roblox.ts` - roblox-ts specific rules (macro patterns, no-array-methods,
  etc.)
- `typescript.ts` - TypeScript rules with type-aware linting
- `oxfmt.ts` - Formatting via `eslint-plugin-oxfmt` (always last in pipeline)
- `spelling.ts` - CSpell with Roblox dictionaries

### Type Generation

Everything a generator writes lives in `src/generated/` (plus the two `.d.ts`
files that have to sit next to the code they augment, and
`src/cli/constants-generated.ts`). Nothing in `src/generated/` is hand-edited,
and both root lint configs ignore it.

`pnpm gen` runs nine generators in `scripts/`: `typegen.ts`
(`src/typegen.d.ts` - ESLint rule types and config names), `typegen-oxlint.ts`
(`src/oxlint/typegen.d.ts`, plus `src/generated/oxlint-native.ts` and
`src/generated/oxlint-capabilities.ts` - the native and jsPlugin capability sets
the oxlint resolver reads), the two `typegen-defaults*.ts` (default rule
severities, used by the redundancy check), `versiongen.ts`
(`src/cli/constants-generated.ts`), `stylistic-gen.ts`
(`src/generated/stylistic.ts` - `@stylistic` rule names), `type-aware-gen.ts`
(`src/generated/type-aware.ts` - the `requiresTypeChecking` snapshot the
type-aware split reads), `roblox-allowed-words-gen.ts`
(`src/generated/roblox-allowed-words.ts` - the Roblox names
`naming: { allowedWords: true }` hands to `flawless/naming-convention`, scraped
from `@rbxts/types`) and `gen-package-extensions.ts` (the `packageExtensions`
block of `pnpm-workspace.yaml`). Run it after modifying configs.

`typegen-oxlint.ts` boots the real ESLint factory to learn which rules the
preset actually enables, so it must stay deterministic: pass explicit values for
anything the factory would otherwise sniff from the host (see `nodeMajor`), or
the committed output changes depending on who ran it.

`typegen.ts` and `type-aware-gen.ts` share one list of config modules
(`scripts/config-factories.ts`); add new modules there or they escape both
generators. `gen-package-extensions.ts`, `type-aware-gen.ts` and
`roblox-allowed-words-gen.ts` all take `--check` (`nr check:extensions`,
`nr check:type-aware`, `nr check:roblox-words`), which CI runs _before_ the
build - `pnpm gen` would otherwise repair a stale file in place and the drift
would never be reported.

### CLI Tools

Two bins:

- `eslint-config` (`src/cli/`) - setup wizard (`npx @isentinel/eslint-config`)
  for project initialization/migration.
- `isentinel-lint` (`src/lint-cli/`) - the hybrid lint runner. It sequences an
  oxlint child and one or two ESLint children, splitting ESLint into a syntactic
  "fast" pass and a type-aware "typed" pass (`passes.ts`, `ESLINT_TYPE_AWARE`),
  each with its own cache keyed by config variant. Worker counts are sized from
  a git-derived dirty count (`files.ts`, `concurrency.ts`) that is corrected for
  ESLint-ignored files (`ignored.ts`) and busted on config drift
  (`config-hash.ts`); `run.ts` is the entry point.

## Plugin Renaming Map

The config renames plugins for consistency:

- `@typescript-eslint/*` → `ts/*`
- `@stylistic/*` → `style/*`
- `yml/*` → `yaml/*`
- `n/*` → `node/*`

When adding rules, use the renamed prefixes.

## Editor Mode

The config auto-detects editor environments and adjusts rules (e.g., downgrades
unused import errors to warnings). Override with `ESLINT_IN_EDITOR=true|false`
or `isInEditor` option.

## Agent Sessions

Agent detection (`isInAgentSession`) only promotes warnings to errors; it never
withholds auto-fixes. Fix suppression is opt-in via `ESLINT_AGENT_NO_AUTOFIX=1`,
for wrappers that fix without anyone reading the diff (edit hooks, fix-on-save).

## Key Dependencies

- Uses pnpm catalogs for dependency versioning (see `pnpm-workspace.yaml`)
- Many eslint plugins are peer dependencies (react, jest, vitest, node,
  eslint-plugin-eslint-plugin)
- Formatting via `eslint-plugin-oxfmt`; `eslint-config-prettier` still turns off
  conflicting stylistic rules, and `prettier` remains only for its `Options`
  type (`prettierOptions` is mapped onto oxfmt settings). No
  `prettier-plugin-jsdoc` — see #509

## Gotchas

- **Forgetting `pnpm gen`**: Causes type errors after config changes
- **Peer deps**: Don't add rules for react/jest/vitest/node without checking
  availability
- **Plugin prefixes**: Always use renamed prefixes (`ts/*` not
  `@typescript-eslint/*`)
