export function isSecure(url: URL): boolean {
	return url.protocol === "https";
}
