import { log, note } from "@clack/prompts";

import ansis from "ansis";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { PackageJson } from "type-fest";

import ownPackageJson from "../../../package.json" with { type: "json" };
import { versionsMap } from "../constants-generated.ts";
import { dependenciesMap } from "../constants.ts";
import type { PromptResult } from "../types.ts";

export async function updatePackageJson(result: PromptResult): Promise<void> {
	const cwd = process.cwd();

	const pathPackageJSON = path.join(cwd, "package.json");

	log.step(ansis.cyan(`Bumping @isentinel/eslint-config to v${ownPackageJson.version}`));

	const packageContent = await fsp.readFile(pathPackageJSON, "utf-8");
	const parsedPackage: PackageJson = JSON.parse(packageContent);

	parsedPackage.devDependencies ??= {};
	parsedPackage.devDependencies["@isentinel/eslint-config"] = `^${ownPackageJson.version}`;
	parsedPackage.devDependencies["eslint"] ??= versionsMap.eslint;

	const addedPackages: Array<string> = [];

	for (const framework of result.frameworks) {
		if (framework in dependenciesMap) {
			for (const dep of dependenciesMap[framework]) {
				parsedPackage.devDependencies[dep] = versionsMap[dep as keyof typeof versionsMap];
				addedPackages.push(dep);
			}
		}
	}

	if (addedPackages.length) {
		note(ansis.dim(addedPackages.join(", ")), "Added packages");
	}

	await fsp.writeFile(pathPackageJSON, JSON.stringify(parsedPackage, null, 2));
	log.success(ansis.green("Changes wrote to package.json"));
}
