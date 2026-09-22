import type { EnvironmentConfig } from "@rsbuild/core";
import { UI_REMOTE_SERVER_ENTRY_FILENAME, type UiDeployFields } from "every-plugin/ui/mf-build";
import { withZephyr } from "zephyr-rsbuild-plugin";
import { computeSriHashForUrl, reportDeployResult } from "../integrity";

export interface UiDeployPluginContext {
  ssr: boolean;
  deployFields: UiDeployFields;
  bosConfigPath: string;
  deployLabel: string;
}

/**
 * Platform-owned deploy hook for ui sources: Zephyr deploy + SRI hash
 * write-back into bos.config.json. Passed into the mf-build factory's
 * `deployPlugins` — deploy tooling stays with the CLI that owns
 * bos.config.json, keeping the mf-build factory deploy-agnostic.
 */
export function uiDeployPlugins(
  ctx: UiDeployPluginContext,
): NonNullable<EnvironmentConfig["plugins"]> {
  if (process.env.DEPLOY !== "true") return [];
  return [
    withZephyr({
      ...(ctx.ssr ? { snapshotType: "csr" as const } : {}),
      hooks: {
        onDeployComplete: async (info: { url: string }) => {
          console.log(`🚀 ${ctx.deployLabel} ${ctx.ssr ? "SSR" : "Client"} Deployed:`, info.url);
          if (ctx.ssr) {
            const ssrEntryUrl = `${info.url.replace(/\/$/, "")}/${UI_REMOTE_SERVER_ENTRY_FILENAME}`;
            const integrity = await computeSriHashForUrl(ssrEntryUrl, {
              resolveEntryUrl: false,
            });
            reportDeployResult({
              url: info.url,
              integrity,
              bosConfigPath: ctx.bosConfigPath,
              urlField: ctx.deployFields.ssrUrlField ?? "",
              integrityField: ctx.deployFields.ssrIntegrityField ?? "",
            });
            return;
          }
          const integrity = await computeSriHashForUrl(info.url);
          reportDeployResult({
            url: info.url,
            integrity,
            bosConfigPath: ctx.bosConfigPath,
            urlField: ctx.deployFields.urlField,
            integrityField: ctx.deployFields.integrityField,
          });
        },
      },
    }),
  ];
}
