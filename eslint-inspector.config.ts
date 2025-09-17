import { isentinel } from "./src";

export default isentinel({
	eslintPlugin: true,
	gitignore: true,
	isInEditor: false,
	name: "project/eslint-inspector",
	pnpm: true,
	react: true,
	roblox: true,
	test: true,
	type: "package",
	typescript: {
		erasableOnly: true,
	},
});
