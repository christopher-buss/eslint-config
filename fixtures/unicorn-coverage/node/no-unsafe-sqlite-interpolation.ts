import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(":memory:");

export function find(id: string): unknown {
	return database.prepare(`SELECT * FROM users WHERE id = ${id}`).get();
}
