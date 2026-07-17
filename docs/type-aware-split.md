# Type-Aware Split

Type-aware rules need a TypeScript program and therefore dominate ESLint wall
time on large projects. Before reaching for a split, try an explicit numeric
`--concurrency` on your existing single config — serial type-aware linting
degrades badly as the run grows, and a fixed worker count (not `auto`, whose
heuristic under-parallelizes type-aware workloads) routinely cuts a cold run by
an order of magnitude.

The `typeAware` factory option additionally splits the config into two
complementary passes, so the non-type-aware majority gives near-instant feedback
without ever building a TypeScript program:

```ts
// eslint.config.ts — the full config; editors and hooks keep using this one.
import isentinel from "@isentinel/eslint-config";

export default isentinel({ type: "game" });
```

```ts
// eslint.fast.config.ts — everything that does not need type information.
import isentinel from "@isentinel/eslint-config";

export default isentinel({ type: "game", typeAware: false });
```

```ts
// eslint.slow.config.ts — only the type-aware rules.
import isentinel from "@isentinel/eslint-config";

export default isentinel({ type: "game", typeAware: "only" });
```

```jsonc
// package.json
{
	"scripts": {
		"lint:fast": "eslint --config eslint.fast.config.ts --cache --cache-location .eslintcache-fast --concurrency 8",
		"lint:slow": "eslint --config eslint.slow.config.ts --cache --cache-location .eslintcache-slow --concurrency 8",
	},
}
```

Use a distinct `--cache-location` per pass — the two passes have different
configs, so sharing one cache file would invalidate it on every run. Use a fixed
`--concurrency` count rather than `auto`: the type-aware pass parallelizes well,
but every worker builds its own TypeScript program, so pick a worker count your
memory can afford.

## What each mode does

- `typeAware: false` drops every rule that requires type information and removes
  the type-aware parser setup (`projectService`), so no TypeScript program is
  ever built and the pass stays fast regardless of cache state.
- `typeAware: "only"` keeps only the type-aware rules plus the parser setup they
  need, and skips the non-JS/TS-language configs (JSON, YAML, TOML, Markdown,
  pnpm, spell checking, formatting) entirely — those files are not linted in
  this pass at all.

For every file, the effective rules of the two passes together equal the full
config exactly (a test enforces this partition). Both modes work for ESLint-only
and hybrid (`oxlint: true`) consumers; in hybrid mode the split applies to the
rules that stay in ESLint after the oxlint hand-off.

## How rules are classified

A rule is type-aware when any of these hold:

- its `meta.docs.requiresTypeChecking` is `true`;
- it is in the preset's manual list of functionally type-aware rules that do not
  declare the flag (the type-aware React rules,
  `cease-nonsense/prefer-read-only-props`, ...);
- it is enabled in a config item whose name contains `type-aware` (this covers
  `overridesTypeAware` and the preset's type-aware config blocks).

Classification is per rule, not per config item: every entry of a rule follows
its classification, so the paired base-rule disables inside the type-aware
blocks (for example `dot-notation: "off"` next to `ts/dot-notation`) stay with
the fast pass and effective severities are preserved exactly.

## Caveats

- **Custom type-aware rules** must declare `meta.docs.requiresTypeChecking`, be
  enabled in a config whose name contains `type-aware` (for example via
  `overridesTypeAware`), or be listed in the factory's `typeAwareRules` option.
  Otherwise they are sorted into the fast pass, where no type information
  exists, and will crash or silently no-op.
- **Unused disable directives** are only reported by the full config. A
  directive for a rule that runs in the other pass would be a false "unused"
  report, so both split modes set
  `linterOptions.reportUnusedDisableDirectives: "off"`.
- **Inline config comments** (`/* eslint some/type-aware-rule: "error" */`) that
  enable a type-aware rule fail in the fast pass — the split only partitions
  config-file rules.
- **Markdown fences**: the handful of syntax-only rules that live inside the
  type-aware config blocks (for example `ts/no-empty-object-type`) follow the
  type-aware pass and therefore no longer apply to fenced Markdown code blocks
  (which only the fast pass lints). Type-aware rules never had real fence
  coverage — fences have no type information.
