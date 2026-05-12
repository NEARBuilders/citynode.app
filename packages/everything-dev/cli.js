#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, "dist", "cli.js");
const srcEntry = join(__dirname, "src", "cli.ts");

await import(existsSync(distEntry) ? distEntry : srcEntry);
