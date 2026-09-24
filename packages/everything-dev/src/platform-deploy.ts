import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { CORE_UI_DEPLOY_FIELDS, UI_REMOTE_SERVER_ENTRY_FILENAME } from "every-plugin/ui/mf-build";
import { fetchResponse } from "./http-client";
import type { DeployResultEntry } from "./integrity";

export interface PlatformBundleFile {
  path: string;
  bytes: Buffer;
  contentType: string;
}

export interface PlatformUploadResult {
  base: string;
  objects: { key: string; sha256: string; integrity: string }[];
  baseUrl: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".html": "text/html",
  ".htm": "text/html",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown",
  ".ts": "text/plain",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

export function guessBundleContentType(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

export async function collectWorkspaceArtifacts(
  workspacePath: string,
): Promise<PlatformBundleFile[]> {
  const distPath = join(workspacePath, "dist");
  const files: PlatformBundleFile[] = [];

  async function walk(relative: string): Promise<void> {
    const entries = await readdir(join(distPath, relative), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(rel);
      } else {
        const bytes = await readFile(join(distPath, rel));
        files.push({ path: rel, bytes, contentType: guessBundleContentType(rel) });
      }
    }
  }

  try {
    await stat(distPath);
  } catch {
    return files;
  }

  await walk("");
  return files;
}

export async function uploadBundlesToPlatform(input: {
  siteUrl: string;
  apiKey: string;
  account: string;
  gateway: string;
  workspace: string;
  files: PlatformBundleFile[];
}): Promise<PlatformUploadResult> {
  if (input.files.length === 0) {
    throw new Error(`No dist/ artifacts found to upload for workspace "${input.workspace}".`);
  }

  const paths: Record<string, { content: string; contentType: string }> = {};
  for (const file of input.files) {
    paths[file.path] = {
      content: file.bytes.toString("base64"),
      contentType: file.contentType,
    };
  }

  const response = await fetchResponse(`${input.siteUrl}/api/storage/bundles`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
    },
    body: JSON.stringify({
      account: input.account,
      gateway: input.gateway,
      workspace: input.workspace,
      paths,
    }),
    timeout: "120 seconds",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(detail) as { message?: string; data?: { hint?: string } };
      if (parsed.message)
        message = parsed.data?.hint ? `${parsed.message} (${parsed.data.hint})` : parsed.message;
    } catch {
      if (detail) message = detail.slice(0, 200);
    }
    throw new Error(`Platform bundle upload failed: ${message}`);
  }

  const payload = (await response.json()) as {
    base: string;
    objects: PlatformUploadResult["objects"];
  };
  const base = payload.base ?? `bundles/${input.account}/${input.gateway}/${input.workspace}`;
  return {
    base,
    objects: payload.objects ?? [],
    baseUrl: `${input.siteUrl.replace(/\/$/, "")}/${base}/`,
  };
}

export function platformDeployEntries(input: {
  key: string;
  kind: "app" | "plugin";
  uploaded: PlatformUploadResult;
}): DeployResultEntry[] {
  const { key, kind, uploaded } = input;
  const slot = kind === "app" ? "app" : "plugins";
  const entries: DeployResultEntry[] = [
    {
      url: uploaded.baseUrl,
      integrity: uploaded.objects.find((o) => o.key.endsWith("/remoteEntry.js"))?.integrity,
      urlField: `${slot}.${key}.production`,
      integrityField: `${slot}.${key}.integrity`,
    },
  ];

  if (kind === "app" && key === "ui") {
    const ssrIntegrity = uploaded.objects.find((o) =>
      o.key.endsWith(`/ssr/${UI_REMOTE_SERVER_ENTRY_FILENAME}`),
    )?.integrity;
    if (ssrIntegrity) {
      entries.push({
        url: `${uploaded.baseUrl}ssr/`,
        integrity: ssrIntegrity,
        urlField: CORE_UI_DEPLOY_FIELDS.ssrUrlField ?? "",
        integrityField: CORE_UI_DEPLOY_FIELDS.ssrIntegrityField ?? "",
      });
    }
  }

  return entries;
}

/**
 * Image-native deploy entries (plan 043): the runtime image serves its own
 * staged artifacts at its own origin — the publish writes the deterministic
 * URLs, nothing is uploaded. Integrity is omitted: the published URL carries
 * the bytes' identity via the image build itself.
 */
export function platformUrlDeployEntries(input: {
  origin: string;
  account: string;
  gateway: string;
  key: string;
  kind: "app" | "plugin";
}): DeployResultEntry[] {
  const { origin, account, gateway, key, kind } = input;
  const slot = kind === "app" ? "app" : "plugins";
  const base = `${origin.replace(/\/$/, "")}/bundles/${account}/${gateway}/${key}/`;
  const entries: DeployResultEntry[] = [
    {
      url: base,
      urlField: `${slot}.${key}.production`,
      integrityField: `${slot}.${key}.integrity`,
    },
  ];

  if (kind === "app" && key === "ui") {
    entries.push({
      url: `${base}ssr/`,
      urlField: CORE_UI_DEPLOY_FIELDS.ssrUrlField ?? "",
      integrityField: CORE_UI_DEPLOY_FIELDS.ssrIntegrityField ?? "",
    });
  }

  return entries;
}
