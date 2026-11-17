const VERSION = /v(?<major>\d+)/;

export function major(text: string): string | undefined {
	return text.match(VERSION)?.groups?.major;
}
