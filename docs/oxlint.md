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

> [!NOTE] In hybrid mode, give the oxlint factory only the structural options
> (`type`, `roblox`, `stylistic`, `root`, ignores...). Do NOT mirror `test` or
> `react`: those rule families stay in ESLint (see below), and enabling them on
> the oxlint side would double-lint the same files.

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
- **Type-aware plugin rules** — any rule whose `meta.docs.requiresTypeChecking`
  is true (`sonar/no-ignored-return`, `sonar/no-redundant-optional`,
  `sonar/no-try-promise`, `unicorn/no-non-function-verb-prefix`,
  `arrow-style/no-export-default-arrow`, `eslint-plugin/no-property-in-node`,
  four `test/*` jest rules). The oxlint factory refuses to emit them as
  jsPlugins because they crash or silently no-op without type information; a
  test enforces this against the plugins' runtime metadata.
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

### Dead rule warning

Because the ESLint side drops every oxlint-owned rule (and lets oxlint format
real JS/TS files), any rule in _your own_ config that oxlint owns has no effect
in ESLint. Setting `"oxfmt/oxfmt": "off"` in a scoped ESLint block, for example,
does not stop oxlint from formatting the file.

In hybrid mode the factory warns at config-build time and lists each such entry
(rule name and config block), telling you to move it to `oxlint.config.ts` (or
your oxfmt options) or remove it. Entries scoped to Markdown virtual files
(`**/*.md/**`) are exempt, since oxlint cannot lint them. Suppress the warning
with `oxlintWarnDeadRules: false`.

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

## Known issue: intermittent segfault formatting Markdown

Linting a Markdown file occasionally (roughly 1 in 15 runs) crashes node with a
segmentation fault (exit 139 / 0xC0000005). This is **independent of oxlint and
hybrid mode** — it reproduces identically with the published ESLint-only config
(`6.0.0-beta.6`) and disappears when `oxfmt/oxfmt` is disabled for `**/*.md` —
the crash is in eslint-plugin-oxfmt's synckit worker invoking the oxfmt native
binding on Markdown files (the oxfmt CLI and the in-process `format()` API do
not crash on the same input). Until fixed upstream, rerun the lint on a crash;
disabling Markdown formatting (`formatters: { markdown: false }`) avoids it at
the cost of unformatted Markdown.

## ESLint 10 peer note

If you are on ESLint 10, `@typescript-eslint/utils` and
`@typescript-eslint/type-utils` must resolve to `>=8.62.1` or ESLint crashes at
startup (`Class extends value undefined`). This repo pins them via pnpm
`overrides`, which do not travel with the published package — add the same
overrides to your own `pnpm-workspace.yaml` if you hit that error:

```yaml
overrides:
  "@typescript-eslint/type-utils": 8.62.1
  "@typescript-eslint/utils": 8.62.1
```

## Validating the config

The repo ships `scripts/validate-oxlint.ts`, which checks every native rule in
the generated config against the installed oxlint binary (`oxlint --rules`):

```bash
pnpm validate:oxlint
```
