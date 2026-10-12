/**
 * Engine bootstrap for the lint runner. Spawned as
 * `node <this file> <engine bin>` with the engine's complete argument list as a
 * JSON string array on stdin; it decodes that list, installs it as
 * `process.argv` and then loads the engine's own bin in this same process.
 *
 * It exists to keep file lists off OS command lines: a hook selecting thousands
 * of files would otherwise overflow `CreateProcessW` (32,767 chars) or cmd.exe
 * (8,191) and have to be split into batches, each one starting another lint
 * stack. The command line that launches this process has the same two
 * arguments however many files the run lints.
 *
 * Kept free of imports beyond Node's own so it loads in milliseconds and
 * nothing it pulls in can observe the placeholder `process.argv`.
 */
import { Buffer } from "node:buffer";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** What the bootstrap hands over to the engine. */
interface Launch {
	/** The engine arguments, verbatim. */
	args: Array<string>;
	/** Absolute path to the engine's bin. */
	bin: string;
}

/** The exit code for a launch this bootstrap could not complete. */
const BOOTSTRAP_FAILURE = 2;

/**
 * Read stdin to its end. Asynchronous rather than `readFileSync(0)`, which can
 * fail with `EAGAIN` on a non-blocking pipe before the writer has finished.
 *
 * @returns The bytes stdin carried.
 */
async function readStdin(): Promise<Buffer> {
	const chunks: Array<Buffer> = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
	}

	return Buffer.concat(chunks);
}

/**
 * Whether a decoded payload is an array of strings. Restated rather than
 * imported from the package's guards, so this entry stays dependency-free.
 *
 * @param value - The decoded payload.
 * @returns Whether every element is a string.
 */
function isStringArray(value: unknown): value is Array<string> {
	return Array.isArray(value) && value.every((element) => typeof element === "string");
}

/**
 * Decode the engine argument list the runner streamed in.
 *
 * @param bytes - The raw stdin payload.
 * @returns The arguments, verbatim.
 */
function decodeArguments(bytes: Buffer): Array<string> {
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const parsed: unknown = JSON.parse(decoder.decode(bytes));
	if (!isStringArray(parsed)) {
		throw new TypeError("expected a JSON array of argument strings on stdin");
	}

	return parsed;
}

/**
 * Read and validate everything the launch needs. Only this phase is the
 * bootstrap's own: its failures are reported as such and exit 2.
 *
 * @returns The launch.
 * @rejects {Error} When the usage, stdin or argument payload is invalid.
 */
async function prepare(): Promise<Launch> {
	const [bin, ...extra] = process.argv.slice(2);
	if (bin === undefined || bin.length === 0 || extra.length > 0) {
		throw new Error("usage: node bootstrap <engine bin> (arguments as JSON on stdin)");
	}

	return { args: decodeArguments(await readStdin()), bin };
}

/**
 * Prepare the launch, then become the engine.
 *
 * The engine import stays outside the catch around {@link prepare}: its
 * failures are left to Node's default handling, so they surface (stack and
 * exit code included) exactly as they would from a direct `node <bin>` launch.
 *
 * @rejects {Error} Whatever the engine's own module evaluation throws.
 */
async function main(): Promise<void> {
	let launch: Launch;
	try {
		launch = await prepare();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`isentinel-lint: could not start the engine: ${message}\n`);
		process.exitCode = BOOTSTRAP_FAILURE;
		return;
	}

	// Exactly the argv a direct `node <bin> ...args` launch would have seen:
	// ESLint reads `process.argv`, and oxlint slices it before handing it to
	// its native binding.
	process.argv = [process.execPath, launch.bin, ...launch.args];
	await import(pathToFileURL(launch.bin).href);
}

void main();
