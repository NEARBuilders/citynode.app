import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readSessionHandle } from "./auth-session";
import {
  buildWorkspaceTargets,
  resolveCdnProvider,
  resolveWorkspaceTarget,
  selectWorkspaceTargets,
} from "./build";
import { generateCodeArtifacts } from "./code-artifacts";
import { loadResolvedConfig } from "./config";
import type { WorkspaceDeployResult } from "./contract";
import { ensureDelegateKey, submitRegistryWriteDelegated } from "./delegate-signer";
import {
  buildRegistryConfigUrlForNetwork,
  fetchBosConfigFromFastKv,
  getRegistryNamespaceForNetwork,
  type NetworkId,
} from "./fastkv";
import { applyDeployResults, type DeployResultEntry } from "./integrity";
import {
  describeSigningStrategy,
  resolveSigningStrategy,
  type SigningStrategy,
  submitRegistryWrite,
} from "./near-signer";
import { getNetworkIdForAccount } from "./network";
import { collectWorkspaceArtifacts, uploadBundlesToPlatform } from "./platform-deploy";
import type { BosConfig, BosConfigInput, PublishConfig, RuntimeConfig } from "./types";
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
  wallet?: boolean;
  registry?: string;
  cdn?: "zephyr" | "platform";
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

  const publishAuth: PublishConfig["auth"] = bosConfig.publish?.auth;
  const governsWalletPublish = (publishAuth === "session" || input.wallet) && !input.privateKey;
  if (governsWalletPublish) {
    const session = readSessionHandle(configDir);
    if (!session?.credential) {
      return {
        status: "error",
        registryUrl,
        error:
          (input.wallet
            ? "--wallet requires"
            : 'bos.config.json sets publish.auth = "session", but') +
          " no CLI session is stored in .bos/ for this project. Run bos login to create one.",
      };
    }
    if (session.credential.accountId && session.credential.accountId !== account) {
      return {
        status: "error",
        registryUrl,
        error:
          `The CLI session was created for ${session.credential.accountId}, but the configured ` +
          `account is ${account}. Gasless wallet publish relays the FastKV write under the session's ` +
          "NEAR account. Run bos login again under the matching account.",
      };
    }
  }
  if (publishAuth && !input.privateKey) {
    if (publishAuth === "custody") {
      return {
        status: "error",
        registryUrl,
        error:
          'bos.config.json sets publish.auth = "custody", but custody publish is not implemented yet (see NEARBuilders/everything-dev#291).',
      };
    }
  }

  const cdnProvider = resolveCdnProvider(bosConfig, input.cdn);
  if (cdnProvider === "platform" && !input.privateKey) {
    const session = readSessionHandle(configDir);
    if (!session?.credential) {
      return {
        status: "error",
        registryUrl,
        error:
          'Platform CDN is enabled (bos.config.json sets deploy.cdn = "platform", or --cdn platform), ' +
          "but no CLI session is stored in .bos/ for this project. Run bos login to create one.",
      };
    }
    if (session.credential.accountId && session.credential.accountId !== account) {
      return {
        status: "error",
        registryUrl,
        error:
          `The CLI session was created for ${session.credential.accountId}, but the configured ` +
          `account is ${account}. Platform bundle uploads are pinned to the session's NEAR account. ` +
          "Run bos login again under the matching account.",
      };
    }
  }

  if (dryRun) {
    return { status: "dry-run", registryUrl, built, skipped };
  }

  let strategy: SigningStrategy;
  if (input.wallet) {
    console.log(
      `  Signing via ${colors.cyan("gasless NEP-366 delegate action (relayed by the platform relayer)")}`,
    );
  } else {
    try {
      strategy = await resolveSigningStrategy({ privateKey: input.privateKey, account, network });
      console.log(`  Signing via ${colors.cyan(describeSigningStrategy(strategy))}`);
    } catch (error) {
      return {
        status: "error" as const,
        registryUrl,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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
      cdnProviderOverride: cdnProvider,
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
  let publishPayload: BosConfigInput = isStaging ? { ...rawConfig, domain: gateway } : rawConfig;

  if (cdnProvider === "platform") {
    const session = readSessionHandle(configDir);
    const credential = session?.credential;
    if (!credential) {
      return {
        status: "error",
        registryUrl,
        built,
        skipped,
        deployResults,
        error: "Platform CDN is enabled but no CLI session is stored. Run bos login first.",
      };
    }

    const uploadTargets = (built ?? []).filter((key) => targets.includes(key));
    const platformEntries: DeployResultEntry[] = [];

    console.log();
    console.log("  Uploading bundles to platform storage...");
    for (const key of uploadTargets) {
      const ws = resolveWorkspaceTarget(key, bosConfig, runtimeConfig, configDir);
      if (!ws) continue;

      const files = await collectWorkspaceArtifacts(ws.path);
      if (files.length === 0) {
        console.log(
          `    ${colors.yellow("⚠")} ${padRight(key, 28)} no dist/ artifacts found — skipped`,
        );
        continue;
      }

      const uploaded = await uploadBundlesToPlatform({
        siteUrl: credential.siteUrl,
        apiKey: credential.apiKey,
        account,
        gateway,
        workspace: key,
        files,
      });

      const entryIntegrity = uploaded.objects.find((o) =>
        o.key.endsWith("/remoteEntry.js"),
      )?.integrity;
      const urlField = ws.kind === "app" ? `app.${key}.production` : `plugins.${key}.production`;
      platformEntries.push({
        url: uploaded.baseUrl,
        integrity: entryIntegrity,
        urlField,
        integrityField: `${ws.kind}.${key}.integrity`,
      });
      console.log(
        `    ${colors.green(icons.ok)} ${padRight(key, 28)} ${uploaded.objects.length} object(s) → ${uploaded.baseUrl}`,
      );
    }

    if (platformEntries.length > 0) {
      const merged = applyDeployResults(rawConfig as Record<string, unknown>, platformEntries);
      try {
        writeFileSync(rawConfigPath, `${JSON.stringify(merged, null, 2)}\n`);
      } catch (error) {
        return {
          status: "error",
          registryUrl,
          built,
          skipped,
          deployResults,
          error: `Failed to write bundle URLs to bos.config.json: ${error instanceof Error ? error.message : error}`,
        };
      }
      publishPayload = (isStaging ? { ...merged, domain: gateway } : merged) as BosConfigInput;
    }
  }

  const registryKey = `apps/${account}/${gateway}/bos.config.json`;
  const registryNamespace = getRegistryNamespaceForNetwork(network, input.registry);
  const publishedAt = new Date().toISOString();
  const registryEntries: Record<string, string> = {
    [registryKey]: JSON.stringify(publishPayload),
  };
  if (input.wallet) {
    const manifestKey = `apps/${account}/${gateway}/manifests/${publishedAt.replace(/[:.]/g, "-")}.json`;
    registryEntries[manifestKey] = JSON.stringify({
      account,
      gateway,
      network,
      publishedAt,
      registryUrl,
    });
  }

  console.log();
  console.log("  Publishing to:");
  console.log(`    ${colors.cyan(registryUrl)}`);
  if (input.wallet) {
    console.log(
      `    ${colors.dim(`+ per-deploy manifest written atomically in the same delegation`)}`,
    );
  }

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

    console.log(`  Submitting transaction on ${network}...`);

    let result: { success: boolean; txHash?: string };
    if (input.wallet) {
      const session = readSessionHandle(configDir);
      const credential = session?.credential;
      if (!credential || credential.accountId !== account) {
        return {
          status: "error",
          registryUrl,
          error: `--wallet requires a CLI session under ${account}. Run bos login first.`,
        };
      }
      const record = await ensureDelegateKey({
        configDir,
        account,
        contract: registryNamespace,
        network,
        siteUrl: credential.siteUrl,
      });
      result = await submitRegistryWriteDelegated({
        account,
        contract: registryNamespace,
        network,
        args: registryEntries,
        delegatePrivateKey: record.privateKey,
        relayEndpoint: `${credential.siteUrl}/api/auth/near/relay`,
        apiKey: credential.apiKey,
      });
    } else {
      result = await submitRegistryWrite(
        {
          account,
          contract: registryNamespace,
          method: "__fastdata_kv",
          args: registryEntries,
          network,
          privateKey: input.privateKey,
        },
        strategy,
      );
    }

    if (result.txHash) {
      console.log(`  Transaction submitted: ${colors.dim(result.txHash)}`);
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
      txHash: result.txHash,
      built,
      skipped,
      deployResults,
      publishConfig: publishPayload,
    };
  } catch (error) {
    return {
      status: "error",
      registryUrl,
      error: formatNearError(error),
      built,
      skipped,
      deployResults,
    };
  }
}

function formatNearError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("does not have enough allowance")) {
    return (
      "The publish access key has insufficient allowance to cover this transaction.\n" +
      "  Regenerate your key with a higher allowance:\n" +
      "    bos key generate\n" +
      `  Original: ${message}`
    );
  }

  if (message.includes("exceeded gas") || message.includes("GasLimitExceeded")) {
    return `Transaction exceeded gas limit.\n  Original: ${message}`;
  }

  if (message.includes("timeout") || message.includes("Timeout")) {
    return `Transaction timed out. Check NEAR network status.\n  Original: ${message}`;
  }

  return message;
}
