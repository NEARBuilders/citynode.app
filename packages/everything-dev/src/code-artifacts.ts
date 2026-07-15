import { join } from "node:path";
import { type ContractBridgeStatus, syncApiContractBridge } from "./api-contract";
import { loadResolvedConfig, writeResolvedConfig } from "./config";
import type { BosEnv } from "./merge";
import type { BosConfig, RuntimeConfig } from "./types";

interface GeneratedArtifacts {
  resolvedConfigPath?: string;
  contractBridgePath: string;
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

  return {
    resolvedConfigPath: opts?.env ? join(configDir, ".bos/bos.resolved-config.json") : undefined,
    contractBridgePath: bridge.bridgePath,
    contractStatus: bridge.status,
  };
}
