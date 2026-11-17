import { findUpSync } from "find-up-simple";
import { readFileSync } from "node:fs";
import process from "node:process";

import { findGitExclude } from "../../git-exclude.ts";

const LINE_BREAK_PATTERN = /\r?\n/;

/**
 * Reads `.gitignore` and `.git/info/exclude` and returns their patterns as an
 * array for oxlint's top-level `ignorePatterns`.
 *
 * Oxlint does not natively support `.git/info/exclude`, so we parse it
 * ourselves.
 *
 * @returns Parsed ignore patterns from gitignore files.
 */
export function oxlintGitignore(): Array<string> {
	const cwd = process.cwd();
	const patterns: Array<string> = [];

	const gitignoreFile = findUpSync(".gitignore", { cwd });
	if (gitignoreFile !== undefined) {
		patterns.push(...parseGitignoreFile(gitignoreFile));
	}

	const exclude = findGitExclude(cwd);
	if (exclude !== undefined) {
		try {
			patterns.push(...parseGitignoreContent(readFileSync(exclude.file, "utf-8")));
		} catch {
			// No exclude file
		}
	}

	return patterns;
}

function parseGitignoreContent(content: string): Array<string> {
	const patterns: Array<string> = [];

	for (const raw of content.split(LINE_BREAK_PATTERN)) {
		const line = raw.trim();
		if (line !== "" && !line.startsWith("#")) {
			patterns.push(line);
		}
	}

	return patterns;
}

function parseGitignoreFile(filePath: string): Array<string> {
	return parseGitignoreContent(readFileSync(filePath, "utf-8"));
}
