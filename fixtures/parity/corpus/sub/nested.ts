export const   nested = {value:1}
export const nestedCall = someFunction(argumentNumberOne, argumentNumberTwo, argumentNumber3);

declare function someFunction(...values: Array<unknown>): unknown;
declare const argumentNumberOne: number;
declare const argumentNumberTwo: number;
declare const argumentNumber3: number;
