import { findUpSync } from "find-up-simple";
import { readFileSync } from "node:fs";
import process from "node:process";

/**
 * Reads `.gitignore` and `.git/info/exclude` and returns their patterns
 * as an array for oxlint's top-level `ignorePatterns`.
 *
 * Oxlint does not natively support `.git/info/exclude`, so we parse it
 * ourselves.
 *
 * @returns Parsed ignore patterns from gitignore files.
 */
export function gitignore(): Array<string> {
	const cwd = process.cwd();
	const patterns: Array<string> = [];

	for (const file of [".gitignore", ".git/info/exclude"]) {
		const found = findUpSync(file, { cwd });
		if (found !== undefined) {
			patterns.push(...parseGitignoreFile(found));
		}
	}

	return patterns;
}

function parseGitignoreFile(filePath: string): Array<string> {
	const content = readFileSync(filePath, "utf-8");
	const patterns: Array<string> = [];

	for (const raw of content.split(/\r?\n/)) {
		const line = raw.trim();
		if (line !== "" && !line.startsWith("#")) {
			patterns.push(line);
		}
	}

	return patterns;
}
