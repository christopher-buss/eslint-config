# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

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
pnpm release    # Bump version and publish (uses bumpp)
```

## Workflow

- **After modifying configs**: Always run `pnpm gen` to update type definitions
- **Pre-commit hooks** (via hk, see `hk.pkl`): Runs guards, eslint, typecheck
  and tests
- **Conventional commits**: Use `feat:`, `fix:`, `chore:`, etc.

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

`pnpm gen` runs five generators in `scripts/`: `typegen.ts`
(`src/typegen.d.ts` - ESLint rule types and config names), `typegen-oxlint.ts`
(`src/oxlint/` equivalents), the two `typegen-defaults*.ts` (default rule
severities, used by the redundancy check) and `versiongen.ts`
(`src/cli/constants-generated.ts`). Run it after modifying configs.

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
