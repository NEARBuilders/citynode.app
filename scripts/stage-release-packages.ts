#!/usr/bin/env bun

import { join } from "node:path";
import { stageReleasePackages } from "../packages/everything-dev/src/internal/manifest-normalizer";

const rootDir = join(import.meta.dirname, "..");
const outDir = join(rootDir, ".release");

stageReleasePackages({
  repoRoot: rootDir,
  outDir,
});

console.log(`Release packages staged in ${outDir}`);
