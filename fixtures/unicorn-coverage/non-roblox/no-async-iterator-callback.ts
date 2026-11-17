declare function isAllowed(value: string): Promise<boolean>;

export const allowed = Iterator.from(["a", "b"]).filter(async (value) => isAllowed(value));
