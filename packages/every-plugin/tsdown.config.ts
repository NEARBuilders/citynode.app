import { defineConfig } from "tsdown";
import packageJson from "./package.json" with { type: "json" };

const shared = {
  dts: true,
  clean: true,
  outDir: "dist",
  treeshake: true,
  sourcemap: true,
  minify: false,
  unbundle: true,
  define: {
    __EVERY_PLUGIN_VERSION__: JSON.stringify(packageJson.version),
  },
  deps: { neverBundle: ["effect", "zod", /^@orpc\/.*/, /^@module-federation\/.*/] },
} as const;

export default defineConfig([
  {
    ...shared,
    entry: [
      "src/index.ts",
      "src/types.ts",
      "src/errors.ts",
      "src/runtime/index.ts",
      "src/testing/index.ts",
      "src/runtime/mf-config.ts",
      "src/runtime/services/normalize.ts",
      "src/build/shared-deps.ts",
      "src/build/rspack/index.ts",
    ],
    format: ["cjs", "esm"],
  },
  {
    ...shared,
    entry: ["src/dev/serve.ts", "src/cli.ts"],
    format: ["esm"],
    banner: "#!/usr/bin/env bun",
  },
]);
