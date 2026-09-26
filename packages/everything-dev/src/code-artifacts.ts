import { existsSync } from "node:fs";
import { join } from "node:path";
import { CORE_UI_PLUGIN_KEY } from "every-plugin/ui/manifest";
import { generateUiManifest } from "every-plugin/ui/manifest-generator";
import { type ContractBridgeStatus, syncApiContractBridge } from "./api-contract";
import { loadResolvedConfig, writeResolvedConfig } from "./config";
import type { BosEnv } from "./merge";
import type { BosConfig, RuntimeConfig } from "./types";

interface GeneratedArtifacts {
  resolvedConfigPath?: string;
  contractBridgePath: string;
}

interface UiManifestTarget {
  workspaceRoot: string;
  pluginName: string;
  emitRouteTree: boolean;
}

function uiManifestTargets(runtimeConfig: RuntimeConfig): UiManifestTarget[] {
  const targets: UiManifestTarget[] = [];
  const ui = runtimeConfig.ui;
  // The core ui is always a manifest target when local — with no authored
  // rsbuild.config.ts the every-plugin build synthesizes one, so the
  // config's existence no longer gates manifest generation.
  if (ui?.source === "local" && ui.localPath) {
    targets.push({
      workspaceRoot: ui.localPath,
      pluginName: CORE_UI_PLUGIN_KEY,
      emitRouteTree: !existsSync(join(ui.localPath, "src/routeTree.gen.ts")),
    });
  }
  for (const [key, plugin] of Object.entries(runtimeConfig.plugins ?? {})) {
    const uiPath = plugin.ui?.localPath;
    if (plugin.ui?.source === "local" && uiPath && existsSync(join(uiPath, "rsbuild.config.ts"))) {
      targets.push({ workspaceRoot: uiPath, pluginName: key, emitRouteTree: false });
    }
  }
  return targets;
}

export async function generateCodeArtifacts(
  configDir: string,
  config: BosConfig,
  opts?: {
    env?: BosEnv;
    extendsChain?: string[];
    runtimeConfig?: RuntimeConfig;
  },
): Promise<(GeneratedArtifacts & { contractStatus: ContractBridgeStatus[] }) | null> {
  if (opts?.env) {
    writeResolvedConfig(configDir, config, opts.env, opts.extendsChain);
  }

  const runtimeConfig =
    opts?.runtimeConfig ?? (await loadResolvedConfig({ cwd: configDir }))?.runtime;
  if (!runtimeConfig) return null;

  const bridge = await syncApiContractBridge({
    configDir,
    runtimeConfig,
    apiBaseUrl: runtimeConfig.api.url,
  });

  for (const target of uiManifestTargets(runtimeConfig)) {
    await generateUiManifest(target);
  }

  return {
    resolvedConfigPath: opts?.env ? join(configDir, ".bos/bos.resolved-config.json") : undefined,
    contractBridgePath: bridge.bridgePath,
    contractStatus: bridge.status,
  };
}
