// Helper: circular dependency A → B (for import/no-cycle test)
import { b } from "./dep-b";

export function a(): void {
	b();
}
