// Helper: circular dependency B → A (for import/no-cycle test)
import { a } from "./dep-a";

export function b(): void {
	a();
}
