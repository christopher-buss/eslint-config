import { z } from "./mts.mts";
import path from "node:path";
import { a } from "@scope/package";
import fs from "node:fs";
import { b } from "../parent";
import type { Declared } from "./types";

export const used = [z, path, a, fs, b] as const;
export type Used = Declared;
