declare function write(level: string, message: string): void;

function log(message: string, level: string): void {
	write(level, message);
}

export function run(): void {
	log("Starting", "info");
	log("Finished", "info");
}
