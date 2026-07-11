# Oxlint Support

`@isentinel/eslint-config` supports
[oxlint](https://oxc.rs/docs/guide/usage/linter/), a high-performance Rust
linter, in three consumption modes:

1. **ESLint only** (default) — nothing changes for existing consumers.
2. **Hybrid** — oxlint runs the rules it covers (natively, via
   [oxlint-tsgolint](https://github.com/oxc-project/tsgolint) for type-aware
   rules, or by running the original ESLint plugins inside oxlint as jsPlugins);
   ESLint runs the rest.
3. **Oxlint standalone** — an oxlint-only config via the
   `@isentinel/eslint-config/oxlint` export.

## Installation

Oxlint support requires the optional peer dependencies:

```bash
pnpm i -D oxlint oxlint-tsgolint
```

## Hybrid mode (recommended)

Enable `oxlint: true` in your ESLint config and create an oxlint config using
the same options:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	oxlint: true,
	type: "game",
});
```

```ts
// oxlint.config.ts
import { isentinel } from "@isentinel/eslint-config/oxlint";

export default isentinel({
	name: "project/options",
	type: "game",
});
```

Then run both linters:

```jsonc
// package.json
{
	"scripts": {
		"lint": "oxlint --type-aware && eslint --cache",
	},
}
```

> [!IMPORTANT] Run oxlint with `--type-aware`. The type-aware `ts/*` rules are
> executed by oxlint-tsgolint; without the flag they are silently skipped and
> you lose coverage for them (they are dropped from ESLint in hybrid mode).

### How rules are split

The split is driven by an explicit per-rule mapping (`oxlintRuleMapping`,
exported from `@isentinel/eslint-config/oxlint`):

| Target          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `native`        | Implemented natively in oxlint (Rust)                        |
| `tsgolint`      | Type-aware rule executed by oxlint-tsgolint (`--type-aware`) |
| `js-plugin`     | The original ESLint plugin runs inside oxlint as a jsPlugin  |
| stays in ESLint | Not in the mapping; documented in `staysInEslint`            |

With `oxlint: true`, the ESLint factory drops every mapped rule; everything else
keeps running in ESLint, notably:

- **JSON / YAML / TOML / Markdown / package.json / pnpm rules** — oxlint only
  lints JS/TS files.
- **Jest and Vitest rules** — the native oxlint jest plugin does not support
  `settings.jest.globalPackage`
  ([oxc#23290](https://github.com/oxc-project/oxc/issues/23290)), and the vitest
  plugin cannot run under oxlint's jsPlugin runtime.
- **Type-aware custom rules** — `roblox/*` type-aware rules,
  `sentinel/explicit-size-check`, `cease-nonsense/prefer-read-only-props`,
  `flawless/*` and `naming`; oxlint jsPlugins have no type information.
- **React rules** — optional peer plugins with type-aware rules interleaved.
- **`eslint-comments/*`** — these lint `eslint-disable` directives;
  `oxlint-comments/*` covers the oxlint directives on the oxlint side.
- **Markdown code blocks** — rules and formatting for fenced code blocks stay in
  ESLint (oxlint cannot lint virtual files).

A test suite asserts that every rule dropped from ESLint in hybrid mode is
enabled in the oxlint factory output, so coverage loss is a test failure.

## Standalone mode

Use only oxlint (no ESLint) via the dedicated export:

```ts
// oxlint.config.ts
import { isentinel } from "@isentinel/eslint-config/oxlint";

export default isentinel({
	name: "project/options",
	test: { jest: true },
	type: "game",
});
```

Standalone mode keeps spell checking (CSpell), directive-comment hygiene
(`oxlint-comments`), formatting (oxfmt) and the custom roblox-ts rules by
running the ESLint plugins as jsPlugins. Note the limitations above: JSON, YAML,
TOML, Markdown, pnpm and the type-aware custom rules are only available through
ESLint.

## Migrating disable comments

In hybrid mode, `// eslint-disable-next-line <rule>` comments for rules that
moved to oxlint become unused directives (ESLint reports them) and must be
converted to `// oxlint-disable-next-line <rule>` using the **oxlint-side rule
name**:

- Core rules keep their name (`no-console`).
- `ts/<rule>` becomes `typescript/<rule>`.
- Rules that run as jsPlugins use the aliased prefix from the mapping
  (`unicorn/*` that is not native becomes `unicorn-js/*`, core rules that are
  not native become `eslint-js/*`).

The official [`@oxlint/migrate`](https://github.com/oxc-project/oxlint-migrate)
tool can convert comments in bulk with `--replace-eslint-comments`.

## Validating the config

The repo ships `scripts/validate-oxlint.ts`, which checks every native rule in
the generated config against the installed oxlint binary (`oxlint --rules`):

```bash
pnpm validate:oxlint
```
