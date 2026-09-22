import path from "node:path";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig, type EnvironmentConfig, type RsbuildConfig, rspack } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { FixMfDataUriPlugin } from "../../build/rspack";
import {
  createUiSharedDeps,
  MANIFEST_FILENAME,
  restoreManifestPublicPath,
  UI_REMOTE_ENTRY_FILENAME,
  UI_REMOTE_SERVER_ENTRY_FILENAME,
  type UiDeployFields,
} from "./index";
import { uiManifestGenPlugin } from "./manifest-plugin";

/**
 * The full dual-environment rsbuild config for a manifest-composed ui source
 * (ADR 0008 §7 — the plugin build contract, not per-plugin config). The core
 * ui and every plugin ui source build from this one factory: `web` emits the
 * browser remote, `node` the commonjs SSR container; shared deps are strict
 * singletons in the given role.
 */
export interface UiRsbuildConfigOptions {
  /** the ui source root — contains package.json, src/, and the routes dir */
  workspaceRoot: string;
  /** the ui workspace's package.json (shared-dep version resolution) */
  pkg: {
    name: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  /** core provides the shared singletons; plugin remotes consume (`import: false`) */
  role: "provider" | "consumer";
  /** the composition key written into manifest.gen.json (the config-side key) */
  manifestName: string;
  /** directory containing bos.config.json (deploy write-back target) */
  configDir: string;
  deployFields: UiDeployFields;
  /** deploy log label, e.g. "UI" or "Auth UI" */
  deployLabel: string;
  devPort: number;
  webEntry: string;
  webExposes: Record<string, string>;
  nodeEntry: string;
  nodeExposes: Record<string, string>;
  copy?: Array<{ from: string; to: string }>;
  define?: Record<string, string>;
  /**
   * Deploy hook factory — called once per environment when the platform CLI
   * builds for deploy. Returns extra rsbuild plugins (the Zephyr deploy +
   * SRI write-back wiring owned by the platform). Omit elsewhere.
   */
  deployPlugins?: (ctx: {
    ssr: boolean;
    deployFields: UiDeployFields;
    bosConfigPath: string;
    deployLabel: string;
  }) => NonNullable<EnvironmentConfig["plugins"]>;
}

const sanitizeContainerName = (pkgName: string): string => pkgName.replace(/[^A-Za-z0-9_]/g, "_");

export function createUiRsbuildConfig(options: UiRsbuildConfigOptions): RsbuildConfig {
  const {
    workspaceRoot,
    pkg,
    role,
    manifestName,
    configDir,
    deployFields,
    deployLabel,
    devPort,
    webEntry,
    webExposes,
    nodeEntry,
    nodeExposes,
    copy = [],
    define,
    deployPlugins,
  } = options;
  const workspaceRootAbsolute = path.resolve(workspaceRoot);
  const normalizedName = sanitizeContainerName(pkg.name);
  const bosConfigPath = path.resolve(configDir, "bos.config.json");
  const manifestGen = () =>
    uiManifestGenPlugin({ workspaceRoot: workspaceRootAbsolute, pluginName: manifestName });
  const uiSharedDeps = createUiSharedDeps(pkg, { role });

  const deployFor = (ssr: boolean): NonNullable<EnvironmentConfig["plugins"]> =>
    deployPlugins?.({ ssr, deployFields, bosConfigPath, deployLabel }) ?? [];

  const webEnvironment: EnvironmentConfig = {
    plugins: [
      pluginReact(),
      manifestGen(),
      pluginModuleFederation(
        {
          name: normalizedName,
          filename: UI_REMOTE_ENTRY_FILENAME,
          dts: false,
          exposes: webExposes,
          shared: uiSharedDeps,
        },
        { environment: "web" },
      ),
      ...deployFor(false),
    ],
    source: { entry: { index: webEntry }, ...(define ? { define } : {}) },
    resolve: { alias: { "@": "./src" } },
    tools: {
      rspack: (config) => {
        const cssPlugin = config.plugins?.find((p) => p instanceof rspack.CssExtractRspackPlugin) as
          | { options?: Record<string, string> }
          | undefined;
        if (cssPlugin) {
          cssPlugin.options ??= {};
          cssPlugin.options.chunkFilename = "static/css/async/[name].[contenthash].css";
        }
        Object.assign(config, {
          target: "web",
          output: {
            ...config.output,
            publicPath: "auto",
            uniqueName: normalizedName,
            chunkFilename: "static/js/async/[name].[contenthash].js",
            crossOriginLoading: "anonymous",
          },
          resolve: {
            ...config.resolve,
            fallback: { bufferutil: false, "utf-8-validate": false },
          },
          infrastructureLogging: { level: "error" },
          stats: "errors-warnings",
          plugins: [
            ...(config.plugins ?? []),
            TanStackRouterRspack({ target: "react", autoCodeSplitting: true }),
            new FixMfDataUriPlugin(),
          ],
        });
        return config;
      },
    },
    output: {
      distPath: { root: "dist", css: "static/css", js: "static/js" },
      assetPrefix: "auto",
      filename: { js: "[name].js", css: "style.css" },
      copy: [
        ...copy,
        { from: path.join(workspaceRootAbsolute, "src", MANIFEST_FILENAME), to: "./" },
      ],
    },
  };

  // Dev without SSR skips the node environment: it exists for the host's dev
  // SSR container and nothing else. Builds always emit both.
  const includeNodeEnv =
    process.env.BOS_SSR === "1" ||
    process.env.DEPLOY === "true" ||
    process.env.NODE_ENV !== "development";

  const nodeEnvironment: EnvironmentConfig = {
    plugins: [
      pluginReact(),
      manifestGen(),
      pluginModuleFederation(
        {
          name: normalizedName,
          filename: UI_REMOTE_SERVER_ENTRY_FILENAME,
          dts: false,
          exposes: nodeExposes,
          shared: uiSharedDeps,
        },
        { target: "node", environment: "node" },
      ),
      restoreManifestPublicPath(path.resolve(workspaceRootAbsolute, "dist", "ssr")),
      ...deployFor(true),
    ],
    source: { entry: { index: nodeEntry } },
    resolve: {
      alias: {
        "@": "./src",
        "@tanstack/react-devtools": false,
        "@tanstack/react-router-devtools": false,
      },
    },
    tools: {
      rspack: (config) => {
        Object.assign(config, {
          output: { ...config.output, uniqueName: `${normalizedName}_server` },
          resolve: {
            ...config.resolve,
            fallback: { bufferutil: false, "utf-8-validate": false },
          },
          externals: [/^node:/],
          infrastructureLogging: { level: "error" },
          stats: "errors-warnings",
          plugins: [
            ...(config.plugins ?? []),
            TanStackRouterRspack({ target: "react", autoCodeSplitting: false }),
            new FixMfDataUriPlugin(),
          ],
        });
        return config;
      },
    },
    output: { distPath: { root: "dist/ssr" } },
  };

  return defineConfig({
    environments: {
      web: webEnvironment,
      ...(includeNodeEnv ? { node: nodeEnvironment } : {}),
    },
    dev: {
      lazyCompilation: false,
      progressBar: false,
      writeToDisk: true,
      client: { overlay: false },
    },
    server: {
      port: Number(process.env.PORT) || devPort,
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  });
}
