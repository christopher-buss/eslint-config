// Lines around 80 and 100 columns.
export const width79 = ".....................................................";
export const width80 = "......................................................";
export const width81 = ".......................................................";
export const width99 = ".........................................................................";
export const width100 = ".........................................................................";
export const width101 = "..........................................................................";
export const call99 = someFunction(argumentNumberOne, argumentNumberTwo, argumentNumberThree, 999);
export const call101 = someFunction(argumentNumberOne, argumentNumberTwo, argumentNumberThree, 9999);

declare function someFunction(...values: Array<unknown>): unknown;
declare const argumentNumberOne: number;
declare const argumentNumberTwo: number;
declare const argumentNumberThree: number;

export const shortArrow = (value: number) => {
	return value + 1;
};
export const nearWidthArrow = (firstValue: number, secondValue: number) => {
	return firstValue + secondValue + firstValue * secondValue + 1234567;
};
export const overWidthArrow = (firstValue: number, secondValue: number) =>
	firstValue + secondValue + firstValue * secondValue + firstValue - secondValue + 12345;
export const deepArrow = {
	nested: {
		inner: (firstValue: number, secondValue: number) => {
			return firstValue + secondValue * firstValue - secondValue + 1234;
		},
	},
};
