function getCount(value: { count: string }): string {
	return value.count;
}

export const first = Number(getCount({ count: "1" }));
export const second = Number(getCount({ count: "2" }));
