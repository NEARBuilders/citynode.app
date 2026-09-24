import { mergeBosConfigWithExtends } from "../merge";
import type { BosConfigInput } from "../types";
import type { AppDescriptor, AppRegistry, AttachmentRef, PipelineFields } from "./schema";
import { AppDescriptorSchema } from "./schema";

/**
 * Pipeline-owned fields per app entry, keyed by app name. Authored
 * descriptors never carry deployment state — the deploy map resolves local
 * refs to URLs (today extracted verbatim from bos.config.json; tomorrow
 * written back by the deploy pipeline).
 */
export interface AppDeployEntry {
  app?: Partial<Record<"host" | "ui" | "api" | "auth", PipelineFields>>;
  plugins?: Record<string, PipelineFields>;
}
export type DeployMap = Record<string, AppDeployEntry>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const devRef = (ref: { path?: string; development?: string }): string | undefined =>
  ref.path ? `local:${ref.path}` : ref.development;

function pick<T extends object, K extends keyof T>(source: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const ATTACHMENT_FIELDS = [
  "name",
  "proxy",
  "variables",
  "secrets",
  "routes",
  "shared",
  "connectSrc",
  "dependsOn",
  "version",
] as const;

function attachmentToEntry(attachment: AttachmentRef): Record<string, unknown> {
  const development = devRef(attachment);
  return {
    ...(attachment.extends ? { extends: attachment.extends } : {}),
    ...(development ? { development } : {}),
    ...pick(attachment, [...ATTACHMENT_FIELDS]),
    ...(attachment.ui
      ? {
          ui: {
            ...(attachment.ui.name ? { name: attachment.ui.name } : {}),
            ...(attachment.ui.path
              ? { development: `local:${attachment.ui.path}` }
              : attachment.ui.development
                ? { development: attachment.ui.development }
                : {}),
            ...(attachment.ui.integrity ? { integrity: attachment.ui.integrity } : {}),
          },
        }
      : {}),
  };
}

/** Descriptor → authoring-shape `BosConfigInput` (local refs only, no pipeline state). */
export function toConfigInput(descriptor: AppDescriptor): BosConfigInput {
  const input: Record<string, unknown> = {
    ...pick(descriptor, [
      "account",
      "domain",
      "title",
      "description",
      "repository",
      "testnet",
      "staging",
      "ci",
      "publish",
      "deploy",
    ]),
  };

  const app: Record<string, unknown> = {};
  if (descriptor.host) {
    const development = devRef(descriptor.host);
    if (development) app.host = { development, ...pick(descriptor.host, ["secrets"]) };
  }
  if (descriptor.api) {
    const development = devRef(descriptor.api);
    if (development) {
      app.api = {
        development,
        ...pick(descriptor.api, ["proxy", "variables", "secrets", "routes", "shared", "dependsOn"]),
      };
    }
  }
  if (descriptor.ui) {
    const development = devRef(descriptor.ui);
    if (development) app.ui = { development };
  }
  if (descriptor.auth) app.auth = attachmentToEntry(descriptor.auth);
  if (Object.keys(app).length > 0) input.app = app;

  if (descriptor.plugins) {
    const plugins: Record<string, unknown> = {};
    for (const [key, attachment] of Object.entries(descriptor.plugins)) {
      const entry = attachmentToEntry(attachment);
      // today's authored shape omits a name identical to the registry key
      if (entry.name === key) delete entry.name;
      plugins[key] = entry;
    }
    input.plugins = plugins;
  }

  return input as BosConfigInput;
}

function applyPipeline(target: Record<string, unknown>, fields: PipelineFields): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) target[key] = value;
  }
}

function applyDeployMap(config: Record<string, unknown>, entry: AppDeployEntry | undefined): void {
  if (!entry) return;

  if (entry.app && isPlainObject(config.app)) {
    for (const [slot, fields] of Object.entries(entry.app)) {
      const target = config.app[slot];
      if (fields && isPlainObject(target)) applyPipeline(target, fields);
    }
  }
  if (entry.plugins && isPlainObject(config.plugins)) {
    for (const [key, fields] of Object.entries(entry.plugins)) {
      const target = config.plugins[key];
      if (fields && isPlainObject(target)) applyPipeline(target, fields);
    }
  }
}

/**
 * Flatten one app against the registry: `extends` inherits the base App's
 * composition, the child's entries win (depth-1 — chains are deferred,
 * wayfinder ticket 08). The consumed `extends` key is dropped from the
 * output; the deploy map injects pipeline state.
 *
 * `extends` accepts a registry name or an imported App descriptor value —
 * an imported parent is an inlined parent: same materialization, no fetch.
 */
export function resolveApp(
  name: string,
  registry: AppRegistry,
  deployMap: DeployMap = {},
  seen: Set<string> = new Set(),
): BosConfigInput {
  if (seen.has(name)) throw new Error(`Circular extends detected: ${name}`);
  const raw = registry[name];
  if (!raw) throw new Error(`App "${name}" not found in registry`);
  const descriptor = AppDescriptorSchema.parse(raw);

  const nextSeen = new Set(seen);
  nextSeen.add(name);

  let parentInput: BosConfigInput | undefined;
  if (descriptor.extends) {
    if (typeof descriptor.extends === "string") {
      const parentRaw = registry[descriptor.extends];
      if (!parentRaw) {
        throw new Error(`extends target "${descriptor.extends}" not found in registry`);
      }
      parentInput = flattenParent(parentRaw, nextSeen);
    } else {
      parentInput = flattenParent(descriptor.extends, nextSeen);
    }
  }

  const childInput = toConfigInput(descriptor);
  const merged = parentInput ? mergeBosConfigWithExtends(parentInput, childInput) : childInput;

  const resolved = { ...merged } as Record<string, unknown>;
  delete resolved.extends;
  applyDeployMap(resolved, deployMap[name]);
  return resolved as BosConfigInput;
}

function flattenParent(parentRaw: unknown, seen: Set<string>): BosConfigInput {
  const parentDescriptor = AppDescriptorSchema.parse(parentRaw);
  if (parentDescriptor.extends) {
    const parentName =
      typeof parentDescriptor.extends === "string"
        ? parentDescriptor.extends
        : (parentDescriptor.extends as { name?: string }).name;
    throw new Error(
      `extends chains deeper than one level are not supported yet ("${parentDescriptor.name}" extends "${parentName ?? "?"}") — wayfinder ticket 08`,
    );
  }
  return toConfigInput(parentDescriptor);
}

/**
 * Dev-time overlay — merged child-wins over a resolved config by the dev
 * runner (ports, local-vs-remote sources, seeding). Overlays are never
 * published: they exist only in `bos.dev.ts` and apply when the environment
 * is development.
 */
export function applyDevOverlay(
  resolved: BosConfigInput,
  overlay: Partial<AppDescriptor>,
): BosConfigInput {
  return mergeBosConfigWithExtends(resolved, toConfigInput(overlay as AppDescriptor));
}

/** Resolve every app in the registry. */
export function resolveApps(
  registry: AppRegistry,
  deployMap: DeployMap = {},
): Record<string, BosConfigInput> {
  return Object.fromEntries(
    Object.keys(registry).map((name) => [name, resolveApp(name, registry, deployMap)]),
  );
}
