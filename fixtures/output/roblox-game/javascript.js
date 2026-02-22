// Fixable: no-var
const myVariable = 1;

// Fixable: prefer-const
const neverChanged = "constant";

// Fixable: eqeqeq (loose equality)
if (myVariable == 1) {
	void 0;
}

// no-eval
eval("dangerous");

// no-console
console.log("debug output");

// Fixable: prefer-template
const combined = "hello " + `world ${myVariable}`;

// Fixable: object-shorthand
const shorthand = neverChanged;
const object = {
	method() {
		return 1;
	},
	shorthand,
};

// Fixable: prefer-arrow-callback
const result = [1, 2, 3].map(function (item) {
	return item * 2;
});

/**
 * Fixable: no-else-return.
 */
function jsCheckValue(value) {
	if (value > 0) {
		return "positive";
	}

	return "negative";
}

/**
 * Fixable: curly.
 */
function jsCurly(x) {
	if (x) {
		return x;
	}
}

// Fixable: no-unneeded-ternary
const ternaryValue = myVariable || 0;

// Fixable: no-extra-boolean-cast
if (myVariable) {
	void 0;
}

// Fixable: yoda
if (neverChanged === "test") {
	void 0;
}

// Fixable: logical-assignment-operators
let logicalValue;
logicalValue ||= "default";

/**
 * Fixable: no-lonely-if.
 */
function jsLonelyIf(a, b) {
	if (a) {
		void 0;
	} else if (b) {
		void 0;
	}
}

// Fixable: no-undef-init
const jsUndef = undefined;

// Fixable: no-useless-rename
const { bar } = { bar: 1 };

// Fixable: no-useless-computed-key
const jsComputed = { key: true };

// Fixable: prefer-exponentiation-operator
const jsPower = 3 ** 2;

// Fixable: prefer-spread
Math.max.apply(Math, [1, 2, 3]);

/**
 * Fixable: no-useless-return.
 */
function jsUselessReturn() {
	void 0;
}

/**
 * Fixable: no-extra-bind.
 */
function jsBound() {
	return 1;
}

// Fixable: unicorn/no-array-for-each
for (const item of [1, 2, 3]) {
	void item;
}

// Fixable: unicorn/prefer-includes
const jsArray = [1, 2, 3];
const jsFound = jsArray.includes(2);

// Fixable: unicorn/number-literal-case
const jsHex = 0xab;

// Fixable: unicorn/prefer-optional-catch-binding
try {
	void 0;
} catch {
	void 0;
}

/**
 * Sonar/no-duplicate-string (repeated 4+).
 */
function jsDuplicateStrings() {
	const a = "repeated-js-string";
	const b = "repeated-js-string";
	const c = "repeated-js-string";
	const d = "repeated-js-string";
	return a + b + c + d;
}

/**
 * Sonar/no-collapsible-if.
 */
function jsCollapsible(a, b) {
	if (a && b) {
		void 0;
	}
}

/**
 * Sonar/prefer-immediate-return.
 */
function jsImmediate() {
	return 99;
}

/**
 * Sonar/no-redundant-boolean.
 */
function jsRedundant(cond) {
	if (cond) {
		return true;
	}

	return false;
}

// sonar/prefer-while
while (myVariable < 10) {
	break;
}

/**
 * Promise/no-return-wrap.
 */
function jsPromiseWrap() {
	return Promise.resolve(1).then(function (value) {
		return value;
	});
}

// no-alert
alert("warning");

/**
 * Fixable: de-morgan/no-negated-conjunction.
 */
function jsDeMorgan(a, b) {
	return !a || !b;
}

/**
 * Better-max-params.
 */
function jsTooMany(a, b, c, d, e) {
	return a + b + c + d + e;
}

// Fixable: one-var
const jsA = 1;
const jsB = 2;

// Fixable: perfectionist/sort-objects
const jsUnsorted = {
	apple: 1,
	mango: 2,
	zebra: 3,
};

/**
 * No-empty-function.
 */
function jsEmpty() {}

/**
 * Fixable: unicorn/prefer-ternary.
 */
function jsPreferTernary(cond) {
	if (cond) {
		return "y";
	}

	return "n";
}

// Use values so they are not unused
void [
	myVariable,
	neverChanged,
	combined,
	object,
	result,
	jsCheckValue,
	jsCurly,
	ternaryValue,
	logicalValue,
	jsLonelyIf,
	jsUndef,
	bar,
	jsComputed,
	jsPower,
	jsUselessReturn,
	jsBound,
	jsFound,
	jsHex,
	jsDuplicateStrings,
	jsCollapsible,
	jsImmediate,
	jsRedundant,
	jsPromiseWrap,
	jsDeMorgan,
	jsTooMany,
	jsA,
	jsB,
	jsUnsorted,
	jsEmpty,
	jsPreferTernary,
	jsArray,
];
