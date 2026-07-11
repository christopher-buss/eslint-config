// Fixable: style/spaced-comment (no space after //)
//no space comment

// Fixable: unused-imports/no-unused-imports
import { readFile } from "node:fs";
// Fixable: antfu/import-dedupe (duplicate specifier)
import { join, join } from "node:path";
// Fixable: ts/consistent-type-imports (should use type import)
import { Readable } from "node:stream";
// Fixable: import/no-duplicates (duplicate module)
import { resolve } from "node:path";

// Fixable: prefer-const (never reassigned)
let neverReassigned = "hello";

// Fixable: ts/no-inferrable-types
const inferrable: number = 42;

// Fixable: ts/array-type (should be generic form Array<string>)
const names: string[] = [];

// Fixable: prefer-template (string concatenation)
const greeting = "hello " + "world";

// Fixable: eqeqeq
const isNull = neverReassigned == null;

// Fixable: no-else-return
function checkValue(value: number): string {
	if (value > 0) {
		return "positive";
	} else {
		return "non-positive";
	}
}

// Fixable: object-shorthand
const shorthandTarget = "value";
const objectLonghand = { method: function() { return 1; }, shorthandTarget: shorthandTarget };

// Fixable: curly (missing braces)
function needsCurly(condition: boolean): void {
	if (condition) return;
}

// Fixable: prefer-arrow-callback
const mapped = [1, 2, 3].map(function(item) { return item * 2; });

// Fixable: no-var
var oldStyle = "should be let/const";

// Fixable: no-undef-init
let undefinedInit: string | undefined = undefined;

// Fixable: no-useless-rename
const { foo: foo } = { foo: 1 };

// Fixable: no-unneeded-ternary
const val = neverReassigned ? neverReassigned : "default";

// Fixable: logical-assignment-operators
let logicalOr: string | undefined;
logicalOr = logicalOr || "fallback";

// Fixable: no-extra-boolean-cast
if (!!neverReassigned) {
	void 0;
}

// Fixable: yoda
if ("hello" === neverReassigned) {
	void 0;
}

// Fixable: no-lonely-if
function testLonelyIf(a: boolean, b: boolean): void {
	if (a) {
		void 0;
	} else {
		if (b) {
			void 0;
		}
	}
}

// Fixable: unicorn/no-array-for-each
[1, 2, 3].forEach((item) => {
	void item;
});

// Fixable: unicorn/prefer-includes
const haystack = [1, 2, 3];
const found = haystack.indexOf(2) !== -1;

// Fixable: de-morgan/no-negated-conjunction
function deMorgan(a: boolean, b: boolean): boolean {
	return !(a && b);
}

// Fixable: perfectionist/sort-objects
const unsortedObject = {
	zebra: 1,
	apple: 2,
	mango: 3,
};

// Fixable: perfectionist/sort-interfaces
interface UnsortedInterface {
	zebra: string;
	apple: number;
	mango: boolean;
}

// Fixable: perfectionist/sort-union-types
type UnsortedUnion = string | number | boolean;

// Fixable: perfectionist/sort-enums
enum UnsortedEnum {
	Zebra = "zebra",
	Apple = "apple",
	Mango = "mango",
}

// Fixable: perfectionist/sort-named-imports is triggered by the imports above

// Fixable: ts/consistent-type-definitions (should be interface)
type ShouldBeInterface = {
	name: string;
	value: number;
};

// Fixable: ts/prefer-for-of
const items = [1, 2, 3];
for (let i = 0; i < items.length; i++) {
	void items[i];
}

// sonar/no-duplicate-string (repeated 4+ times)
function duplicateStrings(): string {
	const a = "duplicated-string-value";
	const b = "duplicated-string-value";
	const c = "duplicated-string-value";
	const d = "duplicated-string-value";
	return a + b + c + d;
}

// sonar/no-collapsible-if
function collapsibleIf(a: boolean, b: boolean): void {
	if (a) {
		if (b) {
			void 0;
		}
	}
}

// sonar/prefer-immediate-return
function immediateReturn(): number {
	const result = 42;
	return result;
}

// sonar/no-redundant-boolean
function redundantBoolean(condition: boolean): boolean {
	if (condition) {
		return true;
	}
	return false;
}

// sonar/prefer-while
for (; neverReassigned !== "done";) {
	break;
}

// sonar/no-inverted-boolean-check
function invertedCheck(a: boolean): boolean {
	if (!a !== true) {
		return true;
	}
	return false;
}

// promise/no-return-wrap
function promiseReturnWrap(): Promise<number> {
	return Promise.resolve(42).then((value) => {
		return Promise.resolve(value);
	});
}

// better-max-params (more than 4 params)
function tooManyParams(a: number, b: number, c: number, d: number, e: number): number {
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
const power = Math.pow(2, 3);

// Fixable: ts/prefer-literal-enum-member
// (this one uses computed - not fixable but detectable)

// Fixable: one-var (multiple initialized vars in one declaration)
let oneA = 1, oneB = 2;

// Fixable: unicorn/number-literal-case (uppercase hex)
const hex = 0XFF;

// Fixable: unicorn/prefer-optional-catch-binding
try {
	void 0;
} catch (err) {
	void 0;
}

// Fixable: no-useless-computed-key
const computedKey = { ["normal"]: true };

// Fixable: no-extra-bind
const boundFn = function() { return 42; }.bind(undefined);

// Fixable: unicorn/no-useless-undefined
function returnUndefined(): undefined {
	return undefined;
}

// Fixable: prefer-spread
function testSpread(): void {
	const arr = [1, 2, 3];
	Math.max.apply(Math, arr);
}

// Fixable: no-useless-return
function uselessReturn(): void {
	const x = 1;
	void x;
	return;
}

// ts/explicit-function-return-type (missing return type)
function missingReturnType() {
	return 42;
}

// no-empty-function
function emptyFunction(): void {}

// unicorn/consistent-destructuring
function consistentDestructure(options: { a: number; b: number }): number {
	const { a } = options;
	return a + options.b;
}

// Fixable: unicorn/prefer-ternary (single-line)
function preferTernary(condition: boolean): string {
	if (condition) {
		return "yes";
	}
	return "no";
}

// Fixable: ts/no-unnecessary-template-expression
const unnecessaryTemplate = `${neverReassigned}`;

// sonar/destructuring-assignment-syntax
function noDestructure(point: { x: number; y: number }): number {
	return point.x + point.y;
}

// Use all the things so they aren't unused
void [
	neverReassigned, inferrable, names, greeting, isNull,
	checkValue, objectLonghand, needsCurly, mapped, oldStyle,
	undefinedInit, foo, val, logicalOr, testLonelyIf,
	found, deMorgan, unsortedObject, UnsortedEnum,
	items, duplicateStrings, collapsibleIf, immediateReturn,
	redundantBoolean, invertedCheck, promiseReturnWrap, tooManyParams,
	MissingAccessibility, power, oneA, oneB, hex, computedKey,
	boundFn, returnUndefined, testSpread, uselessReturn,
	missingReturnType, emptyFunction, consistentDestructure,
	preferTernary, unnecessaryTemplate, noDestructure,
];

export type { UnsortedInterface, ShouldBeInterface, UnsortedUnion };
