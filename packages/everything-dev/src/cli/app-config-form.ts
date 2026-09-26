/**
 * The TS config form — init scaffolds children with an authored
 * `bos.app.ts` (typed `App()` descriptor) instead of `bos.config.json`.
 * The descriptor is pure data, so the scaffold emits the personalized
 * descriptor as a literal inside the `App()` call; publish/sync still
 * canonicalize the resolved config to JSON for FastKV.
 */

import type { AppDescriptor, AttachmentRef } from "../descriptor/schema";
import { AppDescriptorSchema } from "../descriptor/schema";
import type { BosConfigInput } from "../types";

const LOCAL_PREFIX = "local:";

function stripLocal(development: string | undefined): string | undefined {
  return development?.startsWith(LOCAL_PREFIX) ? development.slice(LOCAL_PREFIX.length) : undefined;
}

function attachmentFromEntry(
  key: string,
  entry: Record<string, unknown>,
  options: { name: boolean } = { name: true },
): Record<string, unknown> {
  const development = entry.development as string | undefined;
  const path = stripLocal(development);
  const out: Record<string, unknown> = {};
  if (options.name) out.name = (entry.name as string | undefined) ?? key;
  if (path !== undefined) out.path = path;
  if (typeof entry.extends === "string") out.extends = entry.extends;
  for (const field of [
    "proxy",
    "variables",
    "secrets",
    "routes",
    "shared",
    "connectSrc",
    "dependsOn",
    "version",
  ] as const) {
    if (entry[field] !== undefined) out[field] = entry[field];
  }
  const ui = entry.ui as Record<string, unknown> | undefined;
  if (ui && typeof ui === "object") {
    const uiPath = stripLocal(ui.development as string | undefined);
    out.ui = {
      ...(typeof ui.name === "string" ? { name: ui.name } : {}),
      ...(uiPath !== undefined ? { path: uiPath } : {}),
      ...(ui.integrity !== undefined ? { integrity: ui.integrity } : {}),
    };
  }
  return out;
}

/**
 * The inverse of `toConfigInput` for the scaffold surface: an authoring-shape
 * config (as personalizeConfig computes it) back into the authored
 * descriptor form a child's `bos.app.ts` embeds. Pipeline state (production
 * URLs, integrity) is dropped — it is deploy-map territory, never authored.
 */
export function configInputToDescriptor(input: BosConfigInput): AppDescriptor {
  const descriptor: Record<string, unknown> = {
    name: (input.domain ?? input.account ?? "child.app") as string,
  };
  for (const field of [
    "extends",
    "account",
    "domain",
    "title",
    "description",
    "repository",
    "testnet",
    "staging",
    "ci",
    "publish",
  ] as const) {
    if (input[field] !== undefined) descriptor[field] = input[field];
  }

  const app = (input.app ?? {}) as Record<string, Record<string, unknown>>;
  const host = app.host;
  if (host?.development) descriptor.host = attachmentFromEntry("host", host, { name: false });
  const ui = app.ui;
  if (ui?.development) descriptor.ui = attachmentFromEntry("ui", ui, { name: false });
  const api = app.api;
  if (api?.development) descriptor.api = attachmentFromEntry("api", api, { name: false });
  const auth = app.auth;
  if (auth?.development) descriptor.auth = attachmentFromEntry("auth", auth);

  const plugins: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(
    (input.plugins ?? {}) as Record<string, Record<string, unknown> | string>,
  )) {
    if (typeof raw === "string") {
      plugins[key] = { name: key, extends: raw };
    } else if (raw && typeof raw === "object") {
      plugins[key] = attachmentFromEntry(key, raw);
    }
  }
  if (Object.keys(plugins).length > 0) descriptor.plugins = plugins;

  return AppDescriptorSchema.parse(descriptor);
}

/** The authored `bos.app.ts` source for a personalized child descriptor. */
export function serializeAppDescriptorSource(descriptor: AppDescriptor): string {
  return `import { App } from "everything-dev/descriptor";

export default App(${JSON.stringify(descriptor, null, 2)});
`;
}

export type { AttachmentRef };
