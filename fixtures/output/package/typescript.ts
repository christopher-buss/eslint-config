// Fixable: style/spaced-comment (no space after //)
// no space comment

// Fixable: unused-imports/no-unused-imports
// Fixable: antfu/import-dedupe (duplicate specifier)
import {} from "node:path";

// Fixable: import/no-duplicates (duplicate module)
// Fixable: ts/consistent-type-imports (should use type import)
// Fixable: import/no-duplicates (duplicate module)

// Fixable: prefer-const (never reassigned)
const neverReassigned = "hello";

// Fixable: ts/no-inferrable-types
const inferrable = 42;

// Fixable: ts/array-type (should be generic form Array<string>)
const names: Array<string> = [];

// Fixable: prefer-template (string concatenation)
const greeting = "hello " + "world";

// Fixable: eqeqeq
const isNull = neverReassigned == null;

/**
 * Fixable: no-else-return.
 * @param value
 */
function checkValue(value: number): string {
	if (value > 0) {
		return "positive";
	}

	return "non-positive";
}

// Fixable: object-shorthand
const shorthandTarget = "value";
const objectLonghand = {
	method() {
		return 1;
	},
	shorthandTarget,
};

/**
 * Fixable: curly (missing braces).
 * @param condition
 */
function needsCurly(condition: boolean): void {
	if (condition) {
	}
}

// Fixable: prefer-arrow-callback
const mapped = [1, 2, 3].map(function (item) {
	return item * 2;
});

// Fixable: no-var
const oldStyle = "should be let/const";

// Fixable: no-undef-init
const undefinedInit: string | undefined = undefined;

// Fixable: no-useless-rename
const { foo } = { foo: 1 };

// Fixable: no-unneeded-ternary
const value = neverReassigned || "default";

// Fixable: logical-assignment-operators
let logicalOr: string | undefined;
logicalOr ||= "fallback";

// Fixable: no-extra-boolean-cast
if (neverReassigned) {
	void 0;
}

// Fixable: yoda
if (neverReassigned === "hello") {
	void 0;
}

/**
 * Fixable: no-lonely-if.
 * @param a
 * @param b
 */
function testLonelyIf(a: boolean, b: boolean): void {
	if (a) {
		void 0;
	} else if (b) {
		void 0;
	}
}

// Fixable: unicorn/no-array-for-each
for (const item of [1, 2, 3]) {
	void item;
}

// Fixable: unicorn/prefer-includes
const haystack = [1, 2, 3];
const found = haystack.includes(2);

/**
 * Fixable: de-morgan/no-negated-conjunction.
 * @param a
 * @param b
 */
function deMorgan(a: boolean, b: boolean): boolean {
	return !a || !b;
}

// Fixable: perfectionist/sort-objects
const unsortedObject = {
	apple: 2,
	mango: 3,
	zebra: 1,
};

// Fixable: perfectionist/sort-enums
enum UnsortedEnum {
	Apple = "apple",
	Mango = "mango",
	Zebra = "zebra",
}

// Fixable: perfectionist/sort-interfaces
interface UnsortedInterface {
	apple: number;
	mango: boolean;
	zebra: string;
}

// Fixable: perfectionist/sort-union-types
type UnsortedUnion = boolean | number | string;

// Fixable: perfectionist/sort-named-imports is triggered by the imports above

// Fixable: ts/consistent-type-definitions (should be interface)
interface ShouldBeInterface {
	name: string;
	value: number;
}

// Fixable: ts/prefer-for-of
const items = [1, 2, 3];
for (const item of items) {
	void item;
}

/**
 * Sonar/no-duplicate-string (repeated 4+ times).
 */
function duplicateStrings(): string {
	const a = "duplicated-string-value";
	const b = "duplicated-string-value";
	const c = "duplicated-string-value";
	const d = "duplicated-string-value";
	return a + b + c + d;
}

/**
 * Sonar/no-collapsible-if.
 * @param a
 * @param b
 */
function collapsibleIf(a: boolean, b: boolean): void {
	if (a && b) {
		void 0;
	}
}

/**
 * Sonar/prefer-immediate-return.
 */
function immediateReturn(): number {
	return 42;
}

/**
 * Sonar/no-redundant-boolean.
 * @param condition
 */
function redundantBoolean(condition: boolean): boolean {
	if (condition) {
		return true;
	}

	return false;
}

// sonar/prefer-while
while (neverReassigned !== "done") {
	break;
}

/**
 * Sonar/no-inverted-boolean-check.
 * @param a
 */
function invertedCheck(a: boolean): boolean {
	if (a) {
		return true;
	}

	return false;
}

/**
 * Promise/no-return-wrap.
 */
async function promiseReturnWrap(): Promise<number> {
	return Promise.resolve(42).then(async (value) => value);
}

/**
 * Better-max-params (more than 4 params).
 * @param a
 * @param b
 * @param c
 * @param d
 * @param e
 */
function tooManyParameters(a: number, b: number, c: number, d: number, e: number): number {
	return a + b + c + d + e;
}

// no-console (only warn/error allowed)
console.log("debug");

// no-eval
eval("code");

// no-alert
alert("hey");

// Fixable: ts/explicit-member-accessibility
class MissingAccessibility {
	name = "test";
	value = 42;

	doSomething(): void {
		void 0;
	}
}

// Fixable: prefer-exponentiation-operator
const power = 2 ** 3;

// Fixable: ts/prefer-literal-enum-member
// (this one uses computed - not fixable but detectable)

// Fixable: one-var (multiple initialized vars in one declaration)
const oneA = 1;
const oneB = 2;

// Fixable: unicorn/number-literal-case (uppercase hex)
const hex = 0xff;

// Fixable: unicorn/prefer-optional-catch-binding
try {
	void 0;
} catch {
	void 0;
}

// Fixable: no-useless-computed-key
const computedKey = { normal: true };

/**
 * Fixable: no-extra-bind.
 */
function boundFunc() {
	return 42;
}

/**
 * Fixable: unicorn/no-useless-undefined.
 */
function returnUndefined(): undefined {
	return undefined;
}

/**
 * Fixable: prefer-spread.
 */
function testSpread(): void {
	const array = [1, 2, 3];
	Math.max.apply(Math, array);
}

/**
 * Fixable: no-useless-return.
 */
function uselessReturn(): void {
	const x = 1;
	void x;
}

/**
 * Ts/explicit-function-return-type (missing return type).
 */
function missingReturnType() {
	return 42;
}

/**
 * No-empty-function.
 */
function emptyFunction(): void {}

/**
 * Unicorn/consistent-destructuring.
 * @param options
 */
function consistentDestructure(options: { a: number; b: number }): number {
	const { a } = options;
	return a + options.b;
}

/**
 * Fixable: unicorn/prefer-ternary (single-line).
 * @param condition
 */
function preferTernary(condition: boolean): string {
	if (condition) {
		return "yes";
	}

	return "no";
}

// Fixable: ts/no-unnecessary-template-expression
const unnecessaryTemplate = neverReassigned;

/**
 * Sonar/destructuring-assignment-syntax.
 * @param point
 */
function noDestructure(point: { x: number; y: number }): number {
	return point.x + point.y;
}

// Use all the things so they aren't unused
void [
	neverReassigned,
	inferrable,
	names,
	greeting,
	isNull,
	checkValue,
	objectLonghand,
	needsCurly,
	mapped,
	oldStyle,
	undefinedInit,
	foo,
	value,
	logicalOr,
	testLonelyIf,
	found,
	deMorgan,
	unsortedObject,
	UnsortedEnum,
	items,
	duplicateStrings,
	collapsibleIf,
	immediateReturn,
	redundantBoolean,
	invertedCheck,
	promiseReturnWrap,
	tooManyParameters,
	MissingAccessibility,
	power,
	oneA,
	oneB,
	hex,
	computedKey,
	boundFunc,
	returnUndefined,
	testSpread,
	uselessReturn,
	missingReturnType,
	emptyFunction,
	consistentDestructure,
	preferTernary,
	unnecessaryTemplate,
	noDestructure,
];

export type { UnsortedInterface, ShouldBeInterface, UnsortedUnion };
