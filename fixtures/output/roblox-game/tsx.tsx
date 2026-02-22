// Fixable: ts/consistent-type-imports
import type { ReactNode } from "some-framework";

// Fixable: prefer-const
const jsxTitle = "Hello";

// Fixable: ts/no-inferrable-types
const jsxCount = 0;

// Fixable: ts/array-type (should be generic)
const jsxItems: Array<string> = [];

// Fixable: perfectionist/sort-interfaces (JSX variant with callbacks)
interface ButtonProps {
	id: string;
	name: string;
	className: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}

// Fixable: perfectionist/sort-union-types
type ButtonVariant = "danger" | "primary" | "secondary";

// Fixable: perfectionist/sort-objects
const defaults = {
	alignItems: "center",
	backgroundColor: "white",
	color: "red",
	zIndex: 10,
};

/**
 * Fixable: eqeqeq.
 */
function isActive(value: null | number): boolean {
	return value != null;
}

/**
 * Fixable: no-else-return.
 */
function getLabel(type: string): string {
	if (type === "submit") {
		return "Submit";
	}

	return "Cancel";
}

// Fixable: prefer-template
const displayName = "Hello" + ` ${jsxTitle}`;

// Fixable: object-shorthand
const jsxConfig = {
	jsxTitle,
	method(): number {
		return 1;
	},
};

/**
 * Fixable: curly.
 */
function jsxCheck(condition: boolean): void {
	if (condition) {
	}
}

// Fixable: prefer-arrow-callback
const doubled = [1, 2].map(function (n) {
	return n * 2;
});

// Fixable: unicorn/no-array-for-each
for (const item of [1, 2, 3]) {
	void item;
}

/**
 * Fixable: de-morgan/no-negated-conjunction.
 */
function jsxDeMorgan(a: boolean, b: boolean): boolean {
	return !a || !b;
}

/**
 * JSX with unsorted props (perfectionist/sort-jsx-props).
 */
function MyButton(props: ButtonProps): ReactNode {
	return (
		<button
			className={props.className}
			disabled={props.disabled}
			id={props.id}
			name={props.name}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	);
}

/**
 * Self-closing div with unsorted props.
 */
function MyDiv(): ReactNode {
	return <div className="test" id="main" style={{ color: "red" }}></div>;
}

// Fixable: ts/explicit-member-accessibility
class JsxComponent {
	name = "component";

	render(): ReactNode {
		return <div>{this.name}</div>;
	}
}

/**
 * Sonar/no-duplicate-string.
 */
function jsxDuplicates(): string {
	const a = "jsx-repeated-value";
	const b = "jsx-repeated-value";
	const c = "jsx-repeated-value";
	const d = "jsx-repeated-value";
	return a + b + c + d;
}

/**
 * Sonar/prefer-immediate-return.
 */
function jsxImmediate(): number {
	return 42;
}

/**
 * Sonar/no-redundant-boolean.
 */
function jsxRedundant(condition: boolean): boolean {
	if (condition) {
		return true;
	}

	return false;
}

/**
 * Better-max-params.
 */
function jsxTooMany(a: number, b: number, c: number, d: number, e: number): number {
	return a + b + c + d + e;
}

// Fixable: no-extra-boolean-cast
const jsxBool = !!jsxCount;

// Fixable: no-useless-computed-key
const jsxComputed = { test: 1 };

// Fixable: unicorn/number-literal-case
const jsxHex = 0xcc;

/**
 * Fixable: no-lonely-if.
 */
function jsxLonely(a: boolean, b: boolean): void {
	if (a) {
		void 0;
	} else if (b) {
		void 0;
	}
}

/**
 * Ts/explicit-function-return-type (missing).
 */
function jsxMissingReturn() {
	return "test";
}

// Use values to avoid unused errors
void [
	jsxTitle,
	jsxCount,
	jsxItems,
	defaults,
	isActive,
	getLabel,
	displayName,
	jsxConfig,
	jsxCheck,
	doubled,
	jsxDeMorgan,
	MyButton,
	MyDiv,
	JsxComponent,
	jsxDuplicates,
	jsxImmediate,
	jsxRedundant,
	jsxTooMany,
	jsxBool,
	jsxComputed,
	jsxHex,
	jsxLonely,
	jsxMissingReturn,
];

export type { ButtonProps, ButtonVariant };
