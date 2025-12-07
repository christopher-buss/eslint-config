# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is `@isentinel/eslint-config`, an opinionated ESLint flat config preset
designed primarily for roblox-ts projects. It's inspired by antfu/eslint-config
and provides a comprehensive set of linting rules with automatic plugin
renaming, spell checking (CSpell), and Prettier integration.

## Environment

- Node.js >= 22.16.0
- pnpm 10.24.0 (auto-managed via `packageManager` field)

## Commands

```bash
pnpm build      # Build (runs typegen first)
pnpm lint       # Run ESLint
pnpm typecheck  # Type checking
pnpm gen        # Generate types (src/typegen.d.ts)
pnpm watch      # Watch mode
pnpm dev        # View rules in browser inspector
pnpm release    # Bump version and publish (uses bumpp)
```

## Workflow

- **After modifying configs**: Always run `pnpm gen` to update type definitions
- **Pre-commit hooks** (via simple-git-hooks): Runs lint-staged and typecheck
- **Conventional commits**: Use `feat:`, `fix:`, `chore:`, etc.

## Architecture

### Entry Point & Factory Pattern

The main export is `isentinel()` in `src/factory.ts` - a factory function that
composes ESLint flat configs based on options:

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

### Config Modules (`src/configs/`)

Each file exports a function returning `TypedFlatConfigItem[]`. Key configs:

- `roblox.ts` - roblox-ts specific rules (macro patterns, no-array-methods,
  etc.)
- `typescript.ts` - TypeScript rules with type-aware linting
- `prettier.ts` - Prettier integration (always last in pipeline)
- `spelling.ts` - CSpell with Roblox dictionaries

### Type Generation

`scripts/typegen.ts` generates `src/typegen.d.ts` containing rule type
definitions and config names. Run `pnpm gen` after modifying configs to update
types.

### CLI Tool

`src/cli/` contains a setup wizard (`npx @isentinel/eslint-config`) for project
initialization/migration.

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
- Prettier integration via `eslint-plugin-prettier` with `prettier-plugin-jsdoc`

## Gotchas

- **Forgetting `pnpm gen`**: Causes type errors after config changes
- **Peer deps**: Don't add rules for react/jest/vitest/node without checking
  availability
- **Plugin prefixes**: Always use renamed prefixes (`ts/*` not
  `@typescript-eslint/*`)
