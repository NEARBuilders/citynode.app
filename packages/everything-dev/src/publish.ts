import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Effect } from "effect";
import { buildWorkspaceTargets, selectWorkspaceTargets } from "./build";
import { generateCodeArtifacts } from "./code-artifacts";
import { loadResolvedConfig } from "./config";
import type { WorkspaceDeployResult } from "./contract";
import {
  buildRegistryConfigUrlForNetwork,
  fetchBosConfigFromFastKv,
  getRegistryNamespaceForNetwork,
  type NetworkId,
} from "./fastkv";
import {
  NostrKeyMissing,
  PayloadTooLarge,
  publishViaNostr,
  RelayRejected,
} from "./nostr-transport";
import { getNetworkIdForAccount } from "./network";
import type { BosConfig, BosConfigInput, RuntimeConfig } from "./types";
import { padRight } from "./utils/string";
import { colors, icons } from "./utils/theme";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractPublishedUrl(output: string): string | null {
  const deployMatch = output.match(/🚀.*Deployed:\s*(https?:\S+)/);
  if (deployMatch) return deployMatch[1];
  const match = output.match(/https?:\/\/[^\s"'<>]+/g);
  if (!match || match.length === 0) return null;
  return match[match.length - 1] ?? null;
}

export async function waitForPublishedConfig(opts: {
  account: string;
  gateway: string;
  publishConfig: BosConfigInput;
  registry?: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<void> {
  const envTimeoutMs = Number(process.env.BOS_PUBLISH_CONFIRMATION_TIMEOUT_MS);
  const envIntervalMs = Number(process.env.BOS_PUBLISH_CONFIRMATION_INTERVAL_MS);
  const timeoutMs =
    opts.timeoutMs ?? (Number.isFinite(envTimeoutMs) ? envTimeoutMs : undefined) ?? 120_000;
  const intervalMs =
    opts.intervalMs ?? (Number.isFinite(envIntervalMs) ? envIntervalMs : undefined) ?? 3_000;
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const verifiedConfig = await fetchBosConfigFromFastKv<BosConfigInput>(
        `bos://${opts.account}/${opts.gateway}`,
        opts.registry,
      );

      if (JSON.stringify(verifiedConfig) === JSON.stringify(opts.publishConfig)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Timed out waiting for publish confirmation at bos://${opts.account}/${opts.gateway}.${reason}`,
  );
}

export async function isConfigAlreadyPublished(opts: {
  account: string;
  gateway: string;
  publishConfig: BosConfigInput;
  registry?: string;
}): Promise<boolean> {
  try {
    const current = await fetchBosConfigFromFastKv<BosConfigInput>(
      `bos://${opts.account}/${opts.gateway}`,
      opts.registry,
    );
    return JSON.stringify(current) === JSON.stringify(opts.publishConfig);
  } catch {
    return false;
  }
}

interface PublishToFastKvInput {
  bosConfig: BosConfig;
  runtimeConfig: RuntimeConfig | null;
  configDir: string;
  env: "production" | "staging";
  build: boolean;
  dryRun: boolean;
  verbose: boolean;
  packages: string;
  network?: "mainnet" | "testnet";
  privateKey?: string;
  registry?: string;
}

interface PublishToFastKvResult {
  status: "published" | "error" | "dry-run";
  registryUrl: string;
  txHash?: string;
  built?: string[];
  skipped?: string[];
  error?: string;
  publishConfig?: BosConfigInput;
  deployResults?: WorkspaceDeployResult[];
}

export async function publishToFastKv(input: PublishToFastKvInput): Promise<PublishToFastKvResult> {
  const { env, dryRun, configDir } = input;
  let bosConfig = input.bosConfig;
  const runtimeConfig = input.runtimeConfig;

  const isStaging = env === "staging";
  const account = isStaging ? (bosConfig.staging?.account ?? bosConfig.account) : bosConfig.account;
  const gateway = isStaging ? (bosConfig.staging?.domain ?? bosConfig.domain) : bosConfig.domain;
  if (!gateway) {
    return {
      status: "error",
      registryUrl: "",
      error: "bos.config.json must define domain to publish",
    };
  }

  const network: NetworkId = input.network ?? getNetworkIdForAccount(account);
  const registryUrl = buildRegistryConfigUrlForNetwork(network, account, gateway, input.registry);
  const targets = selectWorkspaceTargets(input.packages, bosConfig);

  let built: string[] | undefined;
  let skipped: string[] | undefined;
  let deployResults: WorkspaceDeployResult[] | undefined;

  if (dryRun) {
    return { status: "dry-run", registryUrl, built, skipped };
  }

  if (input.build) {
    await generateCodeArtifacts(configDir, bosConfig, {
      env: "production",
      runtimeConfig: runtimeConfig ?? undefined,
    });

    const result = await buildWorkspaceTargets({
      configDir,
      bosConfig,
      runtimeConfig,
      targets,
      deploy: true,
      verbose: input.verbose,
    });
    built = result.built;
    skipped = result.skipped;
    deployResults = result.deployResults;

    if (deployResults) {
      const failures = deployResults.filter((r) => !r.success);
      if (failures.length > 0) {
        const total = deployResults.length;
        console.log();
        console.log(
          colors.error(
            `  ${icons.err} Deploy failed — ${failures.length} of ${total} workspace${total > 1 ? "s" : ""} failed`,
          ),
        );
        console.log();
        for (const f of failures) {
          const errorLine = (f.error ?? "Failed").split("\n")[0];
          console.log(`    ${colors.error(icons.err)} ${padRight(f.key, 28)} ${errorLine}`);
        }
        console.log();
        if (!input.verbose) {
          console.log(colors.dim("  Run with --verbose for full build output."));
          console.log();
        }
        return {
          status: "error" as const,
          registryUrl,
          built,
          skipped,
          deployResults,
          error: `${failures.length} of ${total} workspaces failed to deploy`,
        };
      }
    }

    const refreshed = await loadResolvedConfig({ cwd: configDir });
    if (!refreshed?.config) {
      return {
        status: "error",
        registryUrl,
        built,
        skipped,
        deployResults,
        error: "Failed to reload bos.config.json after build",
      };
    }

    bosConfig = refreshed.config;
  }

  const rawConfigPath = join(configDir, "bos.config.json");
  const rawConfig = JSON.parse(readFileSync(rawConfigPath, "utf-8")) as BosConfigInput;
  const publishPayload: BosConfigInput = isStaging ? { ...rawConfig, domain: gateway } : rawConfig;

  const registryKey = `apps/${account}/${gateway}/bos.config.json`;
  const registryNamespace = getRegistryNamespaceForNetwork(network, input.registry);
  const configValue = JSON.stringify(publishPayload);

  console.log();
  console.log("  Publishing to:");
  console.log(`    ${colors.cyan(registryUrl)}`);

  try {
    const alreadyPublished = await isConfigAlreadyPublished({
      account,
      gateway,
      publishConfig: publishPayload,
      registry: input.registry,
    });
    if (alreadyPublished) {
      console.log("  Already up to date — skipping transaction");
      return {
        status: "published",
        registryUrl,
        built,
        skipped,
        deployResults,
        publishConfig: publishPayload,
      };
    }

    let hostUrl: string;
    if (isStaging && bosConfig.staging?.domain) {
      hostUrl = `https://${bosConfig.staging.domain}`;
    } else if (bosConfig.app.host.production) {
      hostUrl = bosConfig.app.host.production;
    } else {
      return {
        status: "error",
        registryUrl,
        error:
          "bos.config.json must define app.host.production — the nostr transport publishes through the host's apps plugin route.",
        built,
        skipped,
        deployResults,
      };
    }

    console.log(`  Signing registry event and posting to ${colors.cyan(hostUrl)}...`);

    const result = await Effect.runPromise(
      publishViaNostr({
        key: registryKey,
        account,
        gateway,
        registry: registryNamespace,
        value: configValue,
        hostUrl,
      }),
    );

    if (result.transactionHash) {
      console.log(`  Transaction submitted: ${colors.dim(result.transactionHash)}`);
    }

    console.log("  Waiting for publish confirmation...");
    await waitForPublishedConfig({
      account,
      gateway,
      publishConfig: publishPayload,
      registry: input.registry,
    });

    return {
      status: "published",
      registryUrl,
      txHash: result.transactionHash,
      built,
      skipped,
      deployResults,
      publishConfig: publishPayload,
    };
  } catch (error) {
    return {
      status: "error",
      registryUrl,
      error: formatPublishError(error),
      built,
      skipped,
      deployResults,
    };
  }
}

function formatPublishError(error: unknown): string {
  if (error instanceof RelayRejected) {
    if (error.status === 403) {
      return (
        "The signing key is not authorized for this account.\n" +
        "  Bind a deployment key at /settings/deployment-keys (challenge → verify → prepare),\n" +
        "  then set NOSTR_PRIVATE_KEY in your environment or CI secrets.\n" +
        `  Detail: ${error.detail}`
      );
    }
    if (error.status === 429) {
      return `Publish rate limited — retry shortly.\n  Detail: ${error.detail}`;
    }
    return `Publish rejected by the registry relay (status ${error.status}).\n  Detail: ${error.detail}`;
  }
  if (error instanceof PayloadTooLarge) {
    return (
      `bos.config.json is too large to publish as a nostr event (${error.size} > ${error.limit} bytes).\n` +
      "  Reduce the config size or publish via a smaller payload."
    );
  }
  if (error instanceof NostrKeyMissing) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
