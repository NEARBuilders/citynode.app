import { createRequire } from "node:module";
import type { Compiler, RspackPluginInstance } from "@rspack/core";
import { FixMfDataUriPlugin } from "./fix-mf-data-uri-plugin";
import {
  EmitPluginManifest,
  EveryPluginBuild,
  type EveryPluginBuildOptions,
  type PluginManifestEmitterOptions,
} from "./plugin";

export interface EveryPluginComposedBuildOptions extends EveryPluginBuildOptions {
  manifest?: PluginManifestEmitterOptions;
}

export class EveryPluginComposedBuild implements RspackPluginInstance {
  name = "EveryPluginComposedBuild";

  constructor(private readonly options: EveryPluginComposedBuildOptions = {}) {}

  apply(compiler: Compiler) {
    new EmitPluginManifest(this.options.manifest ?? {}).apply(compiler);
    new EveryPluginBuild({ dts: this.options.dts }).apply(compiler);
    new FixMfDataUriPlugin().apply(compiler);
  }
}

export interface PluginBaseConfigOptions {
  drizzle?: boolean;
  externals?: string[];
}

const pluginRequire = createRequire(import.meta.url);

function loadDrizzleMigrationsPlugin(): ((...args: unknown[]) => unknown) | null {
  try {
    const mod = pluginRequire("@proj-airi/unplugin-drizzle-orm-migrations/rspack");
    return (mod as { default?: (...args: unknown[]) => unknown }).default ?? mod;
  } catch {
    return null;
  }
}

export interface PluginBaseConfig {
  externals: string[];
  devtool: false | "source-map";
  plugins: unknown[];
  infrastructureLogging: { level: "error" };
  stats: "errors-warnings";
}

export function createPluginBaseConfig(options: PluginBaseConfigOptions = {}): PluginBaseConfig {
  const shouldDeploy = process.env.DEPLOY === "true";
  const plugins: unknown[] = [new EveryPluginComposedBuild({ dts: false })];

  if (options.drizzle !== false) {
    const drizzlePlugin = loadDrizzleMigrationsPlugin();
    if (drizzlePlugin) {
      plugins.push(drizzlePlugin());
    } else if (options.drizzle === true) {
      throw new Error(
        "createPluginBaseConfig({ drizzle: true }) requires @proj-airi/unplugin-drizzle-orm-migrations to be installed.",
      );
    }
  }

  return {
    externals: options.externals ?? ["pg", "@electric-sql/pglite"],
    devtool: shouldDeploy ? false : "source-map",
    plugins,
    infrastructureLogging: {
      level: "error",
    },
    stats: "errors-warnings",
  };
}
