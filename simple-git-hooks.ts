export default {
	"pre-commit":
		"pnpm install --frozen-lockfile && pnpm lint-staged --config lint-staged.config.ts",
};
