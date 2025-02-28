import { eslintPluginShopify } from "../plugins";
import type { OptionsStylistic, TypedFlatConfigItem } from "../types";

export async function shopify(options: OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const { stylistic = true } = options;

	return [
		{
			name: "style/shopify",
			plugins: {
				shopify: eslintPluginShopify,
			},
			rules: {
				"shopify/prefer-class-properties": "error",
				"shopify/prefer-early-return": ["error", { maximumStatements: 1 }],
				"shopify/react-hooks-strict-return": "error",
				"shopify/strict-component-boundaries": "error",

				...(stylistic
					? {
							"shopify/prefer-module-scope-constants": "error",
							"shopify/typescript-prefer-pascal-case-enums": "error",
							"shopify/typescript-prefer-singular-enums": "error",
						}
					: {}),
			},
			// Shopify has a dependency on 'eslint-plugin-react' so we need to
			// set the react version to avoid the warning.
			settings: {
				react: {
					version: "17.0",
				},
			},
		},
	];
}
