declare function acquire(): Disposable;

export function open(): Disposable {
	using resource = acquire();
	return resource;
}
