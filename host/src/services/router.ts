import type { PluginResult } from "./plugins";

export interface RouterMount {
  key: string;
  title: string;
  suffix: `/${string}` | "";
  router: unknown;
}

function encodePathKey(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function createRouterMounts(plugins: PluginResult): RouterMount[] {
  const mounts: RouterMount[] = [];

  for (const [key, plugin] of Object.entries(plugins.plugins)) {
    if (key === "api" || !plugin.router) continue;

    mounts.push({
      key,
      title: plugin.name,
      suffix: `/${encodePathKey(key)}`,
      router: plugin.router,
    });
  }

  mounts.push({
    key: "api",
    title: plugins.api?.name ?? "api",
    suffix: "",
    router: plugins.api?.router ?? {},
  });

  return mounts;
}
