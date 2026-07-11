// Fixable: no-var
var myVariable = 1;

// Fixable: prefer-const
let neverChanged = "constant";

// Fixable: eqeqeq (loose equality)
if (myVariable == 1) {
	void 0;
}

// no-eval
eval("dangerous");

// no-console
console.log("debug output");

// Fixable: prefer-template
const combined = "hello " + "world " + myVariable;

// Fixable: object-shorthand
const shorthand = neverChanged;
const obj = { method: function() { return 1; }, shorthand: shorthand };

// Fixable: prefer-arrow-callback
const result = [1, 2, 3].map(function(item) { return item * 2; });

// Fixable: no-else-return
function jsCheckValue(value) {
	if (value > 0) {
		return "positive";
	} else {
		return "negative";
	}
}

// Fixable: curly
function jsCurly(x) {
	if (x) return x;
}

// Fixable: no-unneeded-ternary
const ternaryVal = myVariable ? myVariable : 0;

// Fixable: no-extra-boolean-cast
if (!!myVariable) {
	void 0;
}

// Fixable: yoda
if ("test" === neverChanged) {
	void 0;
}

// Fixable: logical-assignment-operators
let logicalVal;
logicalVal = logicalVal || "default";

// Fixable: no-lonely-if
function jsLonelyIf(a, b) {
	if (a) {
		void 0;
	} else {
		if (b) {
			void 0;
		}
	}
}

// Fixable: no-undef-init
let jsUndef = undefined;

// Fixable: no-useless-rename
const { bar: bar } = { bar: 1 };

// Fixable: no-useless-computed-key
const jsComputed = { ["key"]: true };

// Fixable: prefer-exponentiation-operator
const jsPower = Math.pow(3, 2);

// Fixable: prefer-spread
Math.max.apply(Math, [1, 2, 3]);

// Fixable: no-useless-return
function jsUselessReturn() {
	void 0;
	return;
}

// Fixable: no-extra-bind
const jsBound = function() { return 1; }.bind(undefined);

// Fixable: unicorn/no-array-for-each
[1, 2, 3].forEach(function(item) {
	void item;
});

// Fixable: unicorn/prefer-includes
const jsArr = [1, 2, 3];
const jsFound = jsArr.indexOf(2) !== -1;

// Fixable: unicorn/number-literal-case
const jsHex = 0XAB;

// Fixable: unicorn/prefer-optional-catch-binding
try {
	void 0;
} catch (err) {
	void 0;
}

// sonar/no-duplicate-string (repeated 4+)
function jsDuplicateStrings() {
	const a = "repeated-js-string";
	const b = "repeated-js-string";
	const c = "repeated-js-string";
	const d = "repeated-js-string";
	return a + b + c + d;
}

// sonar/no-collapsible-if
function jsCollapsible(a, b) {
	if (a) {
		if (b) {
			void 0;
		}
	}
}

// sonar/prefer-immediate-return
function jsImmediate() {
	const x = 99;
	return x;
}

// sonar/no-redundant-boolean
function jsRedundant(cond) {
	if (cond) {
		return true;
	}
	return false;
}

// sonar/prefer-while
for (; myVariable < 10;) {
	break;
}

// promise/no-return-wrap
function jsPromiseWrap() {
	return Promise.resolve(1).then(function(val) {
		return Promise.resolve(val);
	});
}

// no-alert
alert("warning");

// Fixable: de-morgan/no-negated-conjunction
function jsDeMorgan(a, b) {
	return !(a && b);
}

// better-max-params
function jsTooMany(a, b, c, d, e) {
	return a + b + c + d + e;
}

// Fixable: one-var
let jsA = 1, jsB = 2;

// Fixable: perfectionist/sort-objects
const jsUnsorted = {
	zebra: 3,
	apple: 1,
	mango: 2,
};

// no-empty-function
function jsEmpty() {}

// Fixable: unicorn/prefer-ternary
function jsPreferTernary(cond) {
	if (cond) {
		return "y";
	}
	return "n";
}

// Use values so they are not unused
void [
	myVariable, neverChanged, combined, obj, result,
	jsCheckValue, jsCurly, ternaryVal, logicalVal,
	jsLonelyIf, jsUndef, bar, jsComputed, jsPower,
	jsUselessReturn, jsBound, jsFound, jsHex,
	jsDuplicateStrings, jsCollapsible, jsImmediate,
	jsRedundant, jsPromiseWrap, jsDeMorgan, jsTooMany,
	jsA, jsB, jsUnsorted, jsEmpty, jsPreferTernary,
	jsArr,
];
