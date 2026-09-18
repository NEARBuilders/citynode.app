#!/usr/bin/env bun
import { existsSync } from "node:fs";

if (existsSync(new URL("../src/dev/serve.ts", import.meta.url))) {
  await import("../src/dev/serve.ts");
} else {
  await import("../dist/serve.mjs");
}
