/**
 * Shared option sets for the config snapshot suites. Both the ESLint
 * (`eslint-snapshot.spec.ts`) and oxlint (`oxlint.spec.ts`) suites iterate this
 * list so the two factories are exercised against identical inputs and their
 * coverage stays in step; each suite supplies its own `name` and serializer.
 *
 * `gitignore` and `pnpm` are disabled so the snapshots capture rule wiring
 * rather than environment-dependent ignore files. Spell checking stays enabled;
 * the serializers redact its machine-specific dictionary paths
 * (`redactMachinePaths`).
 */

export interface SnapshotFixture {
	name: string;
	options: Record<string, unknown>;
}

const base = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

export const snapshotFixtures: Array<SnapshotFixture> = [
	{
		name: "roblox-game",
		options: { ...base },
	},
	{
		name: "package",
		options: { ...base, roblox: false, test: { jest: true }, type: "package" },
	},
	{
		name: "scoped-roblox",
		options: { ...base, roblox: { files: ["src/**"], filesTypeAware: ["src/**"] } },
	},
	{
		name: "minimal",
		options: { ...base, formatters: false, stylistic: false },
	},
];
