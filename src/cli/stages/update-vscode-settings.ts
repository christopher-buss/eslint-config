import { log } from "@clack/prompts";

import ansis from "ansis";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { isRecord, isStringArray } from "../../guards.ts";
import { OXC_VSCODE_EXTENSION, vscodeSettingsString } from "../constants.ts";
import type { PromptResult } from "../types.ts";

export async function updateVscodeSettings(result: PromptResult): Promise<void> {
	if (!result.updateVscodeSettings) {
		return;
	}

	const settings = vscodeSettingsString(result.formatter);
	const cwd = process.cwd();
	const dotVscodePath = path.join(cwd, ".vscode");
	const settingsPath = path.join(dotVscodePath, "settings.json");

	if (!fs.existsSync(dotVscodePath)) {
		await fsp.mkdir(dotVscodePath, { recursive: true });
	}

	if (!fs.existsSync(settingsPath)) {
		await fsp.writeFile(settingsPath, `{${settings}}\n`, "utf-8");
		log.success(ansis.green("Created .vscode/settings.json"));
		await recommendExtensions(dotVscodePath, result);
		return;
	}

	let settingsContent = await fsp.readFile(settingsPath, "utf8");

	settingsContent = settingsContent.trim();
	if (settingsContent.endsWith("}")) {
		settingsContent = settingsContent.slice(0, -1).trimEnd();
	}

	settingsContent += settingsContent.endsWith(",") || settingsContent.endsWith("{") ? "" : ",";
	settingsContent += `${settings}}\n`;

	await fsp.writeFile(settingsPath, settingsContent, "utf-8");
	log.success(ansis.green("Updated .vscode/settings.json"));
	await recommendExtensions(dotVscodePath, result);
}

/**
 * Add the oxc extension to `.vscode/extensions.json` for the standalone
 * formatter setup. A file that is not plain JSON is left alone with a warning.
 *
 * @param dotVscodePath - The `.vscode` directory.
 * @param result - The prompt result.
 */
async function recommendExtensions(dotVscodePath: string, result: PromptResult): Promise<void> {
	if (result.formatter !== "standalone") {
		return;
	}

	const extensionsPath = path.join(dotVscodePath, "extensions.json");
	let extensions: Record<string, unknown> = {};
	if (fs.existsSync(extensionsPath)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await fsp.readFile(extensionsPath, "utf8"));
		} catch {
			parsed = undefined;
		}

		if (!isRecord(parsed)) {
			log.warn(
				ansis.yellow(
					`Could not read .vscode/extensions.json; add "${OXC_VSCODE_EXTENSION}" to its recommendations manually.`,
				),
			);
			return;
		}

		extensions = parsed;
	}

	const recommendations = isStringArray(extensions["recommendations"])
		? extensions["recommendations"]
		: [];
	if (recommendations.includes(OXC_VSCODE_EXTENSION)) {
		return;
	}

	extensions["recommendations"] = [...recommendations, OXC_VSCODE_EXTENSION];
	await fsp.writeFile(extensionsPath, `${JSON.stringify(extensions, null, 2)}\n`, "utf-8");
	log.success(ansis.green("Recommended the oxc extension in .vscode/extensions.json"));
}
