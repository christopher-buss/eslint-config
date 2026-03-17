// Helper: module with both named and default exports
// (for import/no-named-as-default and no-named-as-default-member tests)
export const bar = 1;
export const baz = "hello";
export default function (): number {
	return 42;
}
