# @isentinel/eslint-config

## Usage

### Starter Wizard

We provided a CLI tool to help you set up your project, or migrate from the
legacy config to the new flat config with one command.

### Example Usage

For an existing template that already has this config setup, please refer to the
[roblox-ts template](https://github.com/christopher-buss/roblox-ts-project-template)
repository. This includes all necessarily files and configurations to get you up
and running.

```bash
npx @isentinel/eslint-config@latest
```

### Manual Install

If you prefer to set up manually:

```bash
pnpm i -D eslint @isentinel/eslint-config
```

### Create config file

With [`"type": "module"`](https://nodejs.org/api/packages.html#type) in
`package.json` (recommended):

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel();
```

#### Optional: TypeScript Config Support

If you want to use `eslint.config.ts` instead of `.js`, install `jiti` v2.0.0 or
greater:

```bash
pnpm i -D jiti@^2.0.0
```

See
[ESLint's TypeScript configuration documentation](https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files)
for more details.

<details>
<summary>
Combined with legacy config:
</summary>

If you still use some configs from the legacy eslintrc format, you can use the
[`@eslint/eslintrc`](https://www.npmjs.com/package/@eslint/eslintrc) package to
convert them to the flat config.

```ts
// eslint.config.ts
import { FlatCompat } from "@eslint/eslintrc";
import isentinel from "@isentinel/eslint-config";

const compat = new FlatCompat();

export default isentinel(
	{
		ignores: [],
	},

	// Legacy config
	...compat.config({
		extends: [
			"eslint:recommended",
			// Other extends...
		],
	}),

	// Other flat configs...
);
```

> Note that `.eslintignore` no longer works in Flat config. Use the `ignores`
> option instead, see [customization](#customization) for more details.

</details>

### Add script for package.json

For example:

```json
{
	"scripts": {
		"lint": "eslint",
		"lint:fix": "eslint --fix"
	}
}
```

## Recommended Settings

### TSConfig

Many of the rules in this config are designed to work with the following options
set:

```json
{
	"noUncheckedIndexedAccess": true,
	"noImplicitReturns": true,
	"noFallthroughCasesInSwitch": true
}
```

Alternatively, you can install `@isentinel/tsconfig` from pnpm:

```bash
pnpm install --save-dev @isentinel/tsconfig
```

And use it in your `tsconfig.json`:

```json
{
	"extends": "@isentinel/tsconfig/roblox"
}
```

### ESLint

The `ts/no-non-null-assertion` rule is enabled by default, which will warn you
when you use the `!` operator to assert that a value is not `undefined`. The
caveat is that this rule will not always play nicely with
`noUncheckedIndexedAccess`, and will often require you to disable it in certain
places. I believe that this is a good trade-off, as it will help you catch
potential bugs in your code, but you can disable it if you find it too
restrictive.

```json
{
	"rules": {
		"ts/no-non-null-assertion": "off"
	}
}
```

## VS Code support (auto fix)

Install
[VS Code ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

Add the following settings to your `.vscode/settings.json`:

```json
{
	"editor.formatOnSave": false,

	// Auto fix
	"editor.codeActionsOnSave": {
		"source.fixAll.eslint": "always",
		"source.organizeImports": "never"
	},

	// Silent the stylistic rules in you IDE, but still auto fix them
	"eslint.rules.customizations": [
		{ "rule": "style/*", "severity": "off", "fixable": true },
		{ "rule": "format/*", "severity": "off", "fixable": true },
		{ "rule": "*fmt/*", "severity": "off", "fixable": true },
		{ "rule": "*-indent", "severity": "off", "fixable": true },
		{ "rule": "*-spacing", "severity": "off", "fixable": true },
		{ "rule": "*-spaces", "severity": "off", "fixable": true },
		{ "rule": "*-order", "severity": "off", "fixable": true },
		{ "rule": "*-dangle", "severity": "off", "fixable": true },
		{ "rule": "*-newline", "severity": "off", "fixable": true },
		{ "rule": "*quotes", "severity": "off", "fixable": true },
		{ "rule": "*semi", "severity": "off", "fixable": true }
	],

	// Enable eslint for all supported languages
	"eslint.validate": [
		"typescript",
		"typescriptreact",
		"markdown",
		"json",
		"jsonc",
		"yaml",
		"toml"
	]
}
```

## Customization

Normally you only need to import the `isentinel` preset:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel();
```

And that's it! Or you can configure each integration individually, for example:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	// `.eslintignore` is no longer supported in Flat config, use `ignores`
	// instead
	ignores: [
		"./fixtures",
		// ...globs
	],

	// Type of the project. `package` for packages, the default is `game`
	type: "package",

	// Disable yaml support
	yaml: false,
});
```

The `isentinel` factory function also accepts any number of arbitrary custom
config overrides:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel(
	{
		// Configures for this config
	},

	// From the second arguments they are ESLint Flat Configs
	// you can have multiple configs
	{
		files: ["**/*.ts"],
		rules: {},
	},
	{
		rules: {},
	},
);
```

Check out the
[configs](https://github.com/christopher-buss/eslint-config/tree/main/src/configs)
and
[factory](https://github.com/christopher-buss/eslint-config/blob/main/src/factory.ts)
for more details.

> Thanks to [antfu/eslint-config](https://github.com/antfu/eslint-config) and
> [sxzz/eslint-config](https://github.com/sxzz/eslint-config) for the
> inspiration and reference.

### Editor Mode

By default, this config auto-detects whether ESLint is running in an editor
environment (VS Code, JetBrains IDEs, Vim, Neovim) and adjusts certain rules
accordingly. In editor mode:

- `unused-imports/no-unused-imports` is downgraded to "warn" instead of "error"
- Auto-fix is disabled for certain rules to prevent unwanted changes while
  editing
- Other rules are adjusted for a better development experience

You can explicitly control this behavior using the `ESLINT_IN_EDITOR`
environment variable:

```bash
# Force editor mode (useful for AI agents or hooks)
ESLINT_IN_EDITOR=true eslint --fix

# Force non-editor mode
ESLINT_IN_EDITOR=false eslint --fix
```

This is particularly useful when running ESLint from CLI tools or AI agents that
make multiple changes, as it prevents imports from being removed before the code
that uses them is written.

Alternatively, you can set it explicitly in your config:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	isInEditor: true, // or false
});
```

### Named Configs

Enable `namedConfigs` to require all config items to have a `name` property.
This improves debugging and makes the
[ESLint Config Inspector](https://github.com/eslint/config-inspector) much more
useful by displaying meaningful names instead of anonymous configs.

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel(
	{
		name: "project/root",
		namedConfigs: true,
	},
	{
		name: "project/custom-rules",
		files: ["**/*.ts"],
		rules: {},
	},
);
```

> **Note:** This will become the default in a future major version.

### Plugins Renaming

Since flat config requires us to explicitly provide the plugin names (instead of
the mandatory convention from npm package name), we renamed some plugins to make
the overall scope more consistent and easier to write.

| New Prefix | Original Prefix        | Source Plugin                                                                              |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `import/*` | `i/*`                  | [eslint-plugin-i](https://github.com/un-es/eslint-plugin-i)                                |
| `node/*`   | `n/*`                  | [eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n)                     |
| `yaml/*`   | `yml/*`                | [eslint-plugin-yml](https://github.com/ota-meshi/eslint-plugin-yml)                        |
| `ts/*`     | `@typescript-eslint/*` | [@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint) |
| `style/*`  | `@stylistic/*`         | [@stylistic/eslint-plugin](https://github.com/eslint-stylistic/eslint-stylistic)           |

When you want to override rules, or disable them inline, you need to update to
the new prefix:

```diff
-// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
+// eslint-disable-next-line ts/consistent-type-definitions
type foo = { bar: 2 }
```

### Rules Overrides

Certain rules would only be enabled in specific files, for example, `ts/*` rules
would only be enabled in `.ts` files and `vue/*` rules would only be enabled in
`.vue` files. If you want to override the rules, you need to specify the file
extension:

```js
// eslint.config.js
import antfu from "@antfu/eslint-config";

export default antfu(
	{
		typescript: true,
		vue: true,
	},
	{
		// Remember to specify the file glob here, otherwise it might cause the
		// vue plugin to handle non-vue files
		files: ["**/*.vue"],
		rules: {
			"vue/operator-linebreak": ["error", "before"],
		},
	},
	{
		// Without `files`, they are general rules for all files (Markdown
		// excluded — see note below)
		rules: {
			"style/semi": ["error", "never"],
		},
	},
);
```

<!-- prettier-ignore -->
> [!NOTE]
> Rule overrides without an explicit `files` constraint are> automatically
> excluded from Markdown files, via
> [`composer.setDefaultIgnores`](https://github.com/antfu/eslint-flat-config-utils#composersetdefaultignores).
> This prevents JS-only rules (e.g. `no-irregular-whitespace`,
> `perfectionist/sort-imports`) from crashing on `@eslint/markdown`'s
> `SourceCode`, which doesn't expose JS-specific methods like
> `getAllComments()`. If you want a rule to apply to Markdown, scope it
> explicitly with `files: ['**/*.md']`.

We also provided the `overrides` options in each integration to make it easier:

```js
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	typescript: {
		overrides: {
			"ts/consistent-type-definitions": ["error", "interface"],
		},
	},
	yaml: {
		overrides: {
			// ...
		},
	},
});
```

### Spell Checker

This config includes the [CSpell](https://cspell.org/) plugin by default, which
will warn you when you have misspelled words in your code. This can be useful
for catching typos, and ensuring that your code is consistent. Roblox keywords
are also included in the dictionary, which is provided by the
[`cspell-dicts-roblox`](https://github.com/christopher-buss/cspell-dicts-roblox)
package. If any words roblox words are missing, please open an issue on that
repository rather than this one.

Sometimes you will have words that are not in the dictionary, but are still
valid for your project. To add these words to the dictionary, you can create a
`cspell.config.yaml` file in the root of your project with the following
content:

```yaml
# cspell.config.yaml
words:
  - isentinel
  - isverycool
```

To disable this, you can set the `spellCheck` option to `false`:

```js
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	spellCheck: false,
});
```

For more information on how to configure the spell checker, please refer to the
[CSpell documentation](https://cspell.org/).

#### `perfectionist` (sorting)

This plugin
[`eslint-plugin-perfectionist`](https://github.com/azat-io/eslint-plugin-perfectionist)
allows you to sort object keys, imports, etc, with auto-fix.

The plugin is installed and most rules are enabled by default, but these rules
can be disabled or overridden by your own config.

### Optional Configs

We provide some optional configs for specific use cases, that we don't include
their dependencies by default.

#### React

To enable React support, you need to explicitly turn it on:

```js
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	react: true,
});
```

#### Jest

To enable Jest support, you need to explicitly turn it on:

```js
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	test: true,
});
```

Running `npx eslint` should prompt you to install the required dependencies,
otherwise, you can install them manually:

```bash
pnpm i -D eslint-plugin-react-x eslint-plugin-react-jsx eslint-plugin-react-naming-convention eslint-plugin-jest
```

#### Oxlint

The config can run alongside (or be replaced by)
[oxlint](https://oxc.rs/docs/guide/usage/linter/) in three modes: ESLint-only
(the default), hybrid (`oxlint --type-aware && eslint`), and oxlint standalone
via the `@isentinel/eslint-config/oxlint` export.

```ts
// eslint.config.ts - hybrid mode: ESLint drops every rule oxlint covers
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	oxlint: true,
});
```

```ts
// oxlint.config.ts
import { isentinel } from "@isentinel/eslint-config/oxlint";

export default isentinel({
	name: "project/options",
});
```

Requires the optional peer dependencies:

```bash
pnpm i -D oxlint oxlint-tsgolint
```

See [docs/oxlint.md](./docs/oxlint.md) for the per-rule mapping, what stays in
ESLint and why, and migration notes.

#### ESLint Plugin Development

If you're developing an ESLint plugin, you can enable specialized rules to help
ensure your plugin follows best practices:

```ts
// eslint.config.ts
import isentinel from "@isentinel/eslint-config";

export default isentinel({
	eslintPlugin: true,
});
```

Running `npx eslint` should prompt you to install the required dependencies,
otherwise, you can install them manually:

```bash
pnpm i -D eslint-plugin-eslint-plugin
```

### Git hooks

If you want to apply lint and auto-fix before every commit, use
[hk](https://hk.jdx.dev). Create `hk.pkl` in your project root:

```pkl
amends "package://github.com/jdx/hk/releases/download/v1.48.0/hk@1.48.0#/Config.pkl"

hooks {
	["pre-commit"] {
		fix = true
		steps {
			["eslint"] {
				glob = List("*")
				check = "eslint --no-warn-ignored {{files}}"
				fix = "eslint --fix --no-warn-ignored {{files}}"
			}
		}
	}
}
```

and then install hk and activate the hooks:

```bash
mise use hk pkl # or see https://hk.jdx.dev for other install methods
hk install
```

## View what rules are enabled

There is a visual tool to help you view what rules are enabled in your project
and apply them to what files,
[eslint-config-inspector](https://github.com/eslint/config-inspector)

Go to your project root that contains `eslint.config.ts` and run:

```bash
npx eslint-config-inspector
```

## Versioning Policy

This project follows [Semantic Versioning](https://semver.org/) for releases.
However, since this is just a config and involves opinions and many moving
parts, we don't treat rules changes as breaking changes.

### Changes Considered as Breaking Changes

- Node.js version requirement changes
- Huge refactors that might break the config
- Plugins made major changes that might break the config
- Changes that might affect most of the codebases

### Changes Considered as Non-breaking Changes

- Enable/disable rules and plugins (that might become stricter)
- Rules options changes
- Version bumps of dependencies

### I prefer XXX...

Sure, you can configure and override rules locally in your project to fit your
needs. If that still does not work for you, you can always fork this repo and
maintain your own. I am open to PRs that help improve the overall experience for
developers, and there may still be rules activated that do not apply to the
roblox-ts ecosystem.
