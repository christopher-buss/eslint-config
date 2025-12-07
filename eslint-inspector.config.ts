import isentinel from "@isentinel/eslint-config";

export default isentinel({
	name: "project/eslint-inspector",
	eslintPlugin: true,
	gitignore: true,
	isInEditor: false,
	pnpm: true,
	react: true,
	roblox: true,
	test: true,
	type: "package",
	typescript: {
		erasableOnly: true,
	},
});
