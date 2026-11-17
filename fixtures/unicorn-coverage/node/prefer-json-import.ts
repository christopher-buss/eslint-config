import fs from "node:fs";

export const data: unknown = JSON.parse(fs.readFileSync("./data.json", "utf8"));
