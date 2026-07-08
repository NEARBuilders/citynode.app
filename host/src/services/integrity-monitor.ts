import { verifySriForUrl } from "everything-dev/integrity";
import { fetchBosConfigFromFastKv } from "everything-dev/fastkv";
import type { RuntimeConfig } from "everything-dev/types";
import { logger } from "../utils/logger";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

interface MonitoredRemote {
  key: string;
  url: string;
  integrity: string;
  extendsRef?: string;
}

function getIntegrityForExtends(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  let targetPath: string;
  if (key === "auth") {
    targetPath = "app.auth";
  } else if (key.endsWith("-ui")) {
    targetPath = `plugins.${key.slice(0, -3)}.ui`;
  } else {
    targetPath = `plugins.${key}`;
  }

  let current: unknown = config;
  for (const part of targetPath.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (current && typeof current === "object") {
    return (current as Record<string, unknown>).integrity as string | undefined;
  }

  return undefined;
}

function extractMonitoredRemotes(config: RuntimeConfig): MonitoredRemote[] {
  const remotes: MonitoredRemote[] = [];

  if (config.ui?.integrity && config.ui.url) {
    remotes.push({ key: "ui", url: config.ui.url, integrity: config.ui.integrity });
  }

  if (config.api?.integrity && config.api.url) {
    remotes.push({ key: "api", url: config.api.url, integrity: config.api.integrity });
  }

  if (config.auth?.integrity && config.auth.url) {
    remotes.push({
      key: "auth",
      url: config.auth.url,
      integrity: config.auth.integrity,
      extendsRef: config.auth.extendsRef,
    });
  }

  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    if (plugin.integrity && plugin.url) {
      remotes.push({
        key,
        url: plugin.url,
        integrity: plugin.integrity,
        extendsRef: plugin.extendsRef,
      });
    }
    if (plugin.ui?.integrity && plugin.ui.url) {
      remotes.push({
        key: `${key}-ui`,
        url: plugin.ui.url,
        integrity: plugin.ui.integrity,
        extendsRef: plugin.extendsRef,
      });
    }
  }

  return remotes;
}

export function startIntegrityMonitor(
  config: RuntimeConfig,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  if (config.env !== "production") {
    return () => {};
  }

  const remotes = extractMonitoredRemotes(config);
  if (remotes.length === 0) {
    return () => {};
  }

  logger.info(
    `[IntegrityMonitor] Monitoring ${remotes.length} remote(s) every ${intervalMs / 1000}s`,
  );

  async function checkAll(): Promise<void> {
    for (const remote of remotes) {
      try {
        if (remote.extendsRef) {
          const parentConfig = await fetchBosConfigFromFastKv<Record<string, unknown>>(
            remote.extendsRef,
          );
          const latestIntegrity = getIntegrityForExtends(parentConfig, remote.key);
          if (latestIntegrity) {
            await verifySriForUrl(remote.url, latestIntegrity);
          }
        } else {
          await verifySriForUrl(remote.url, remote.integrity);
        }
      } catch (error) {
        logger.error(
          `[IntegrityMonitor] INTEGRITY FAILURE for ${remote.key} (${remote.url}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  checkAll();
  const timer = setInterval(checkAll, intervalMs);

  return () => {
    clearInterval(timer);
    logger.info("[IntegrityMonitor] Stopped");
  };
}
