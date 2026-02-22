// Fixable: ts/consistent-type-imports
import { ReactNode } from "some-framework";

// Fixable: prefer-const
const jsxTitle = "Hello";

// Fixable: ts/no-inferrable-types
const jsxCount = 0;

// Fixable: ts/array-type (should be generic)
const jsxItems: string[] = [];

// Fixable: perfectionist/sort-interfaces (JSX variant with callbacks)
interface ButtonProps {
	onClick: () => void;
	name: string;
	id: string;
	disabled: boolean;
	children: ReactNode;
	className: string;
}

// Fixable: perfectionist/sort-union-types
type ButtonVariant = "primary" | "danger" | "secondary";

// Fixable: perfectionist/sort-objects
const defaults = {
	zIndex: 10,
	color: "red",
	backgroundColor: "white",
	alignItems: "center",
};

// Fixable: eqeqeq
function isActive(value: number | null): boolean {
	return value != null;
}

// Fixable: no-else-return
function getLabel(type: string): string {
	if (type === "submit") {
		return "Submit";
	} 
		return "Cancel";
	
}

// Fixable: prefer-template
const displayName = `Hello` + ` ${  jsxTitle}`;

// Fixable: object-shorthand
const jsxConfig = {
	jsxTitle: jsxTitle,
	method: function(): number { return 1; },
};

// Fixable: curly
function jsxCheck(condition: boolean): void {
	if (condition) return;
}

// Fixable: prefer-arrow-callback
const doubled = [1, 2].map((n) => { return n * 2; });

// Fixable: unicorn/no-array-for-each
for (const item of [1, 2, 3]) {
	void item;
}

// Fixable: de-morgan/no-negated-conjunction
function jsxDeMorgan(a: boolean, b: boolean): boolean {
	return !a || !b;
}

// JSX with unsorted props (perfectionist/sort-jsx-props)
function MyButton(props: ButtonProps): ReactNode {
	return <button disabled={props.disabled} className={props.className} id={props.id} name={props.name} onClick={props.onClick}>{props.children}</button>;
}

// Self-closing div with unsorted props
function MyDiv(): ReactNode {
	return <div style={{ color: "red" }} className="test" id="main"></div>;
}

// Fixable: ts/explicit-member-accessibility
class JsxComponent {
	name = "component";

	render(): ReactNode {
		return <div>{this.name}</div>;
	}
}

// sonar/no-duplicate-string
function jsxDuplicates(): string {
	const a = "jsx-repeated-value";
	const b = "jsx-repeated-value";
	const c = "jsx-repeated-value";
	const d = "jsx-repeated-value";
	return a + b + c + d;
}

// sonar/prefer-immediate-return
function jsxImmediate(): number {
	return 42;
}

// sonar/no-redundant-boolean
function jsxRedundant(condition: boolean): boolean {
	if (condition) {
		return true;
	}
	return false;
}

// better-max-params
function jsxTooMany(a: number, b: number, c: number, d: number, e: number): number {
	return a + b + c + d + e;
}

// Fixable: no-extra-boolean-cast
const jsxBool = !!jsxCount;

// Fixable: no-useless-computed-key
const jsxComputed = { "test": 1 };

// Fixable: unicorn/number-literal-case
const jsxHex = 0xCC;

// Fixable: no-lonely-if
function jsxLonely(a: boolean, b: boolean): void {
	if (a) {
		void 0;
	} else if (b) {
			void 0;
		}
}

// ts/explicit-function-return-type (missing)
function jsxMissingReturn() {
	return "test";
}

// Use values to avoid unused errors
void [
	jsxTitle, jsxCount, jsxItems, defaults, isActive,
	getLabel, displayName, jsxConfig, jsxCheck, doubled,
	jsxDeMorgan, MyButton, MyDiv, JsxComponent,
	jsxDuplicates, jsxImmediate, jsxRedundant, jsxTooMany,
	jsxBool, jsxComputed, jsxHex, jsxLonely, jsxMissingReturn,
];

export type { ButtonProps, ButtonVariant };
