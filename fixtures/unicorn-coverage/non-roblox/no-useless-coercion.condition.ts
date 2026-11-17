declare function work(): void;

export function check(value: boolean): void {
	if (!!value) {
		work();
	}
}
