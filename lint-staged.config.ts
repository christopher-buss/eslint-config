import type { Configuration } from "lint-staged";

export default {
	"*": (stagedFiles) => [
		`pnpm exec eslint --fix --cache --no-warn-ignored ${stagedFiles.join(" ")}`,
	],
	"*.ts": ["sh -c 'tsc --noEmit'"],
} satisfies Configuration;
