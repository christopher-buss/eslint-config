class Base {
	protected stored = 0;

	public get value(): number {
		return this.stored;
	}
}

export class Child extends Base {
	public set value(next: number) {
		this.stored = next;
	}
}
