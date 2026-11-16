class Base {
	protected stored = 0;

	public get value(): number {
		return this.stored;
	}

	public set value(next: number) {
		this.stored = next;
	}
}

export class Child extends Base {
	public override get value(): number {
		return this.stored + 1;
	}
}
