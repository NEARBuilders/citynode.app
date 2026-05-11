import { createDefu } from "defu";
import type { ExtendsConfig } from "./types";

export const BOS_CONFIG_ORDER = [
  "extends",
  "account",
  "domain",
  "testnet",
  "staging",
  "repository",
  "app",
  "plugins",
  "shared",
] as const;

export type BosConfigFieldName = (typeof BOS_CONFIG_ORDER)[number];

export type BosEnv = "development" | "production" | "staging";

export interface ResolvedConfigMeta {
  env: BosEnv;
  resolvedAt: string;
  extendsChain: string[];
  source?: string;
}

const ARRAY_UNION_KEYS = new Set(["secrets"]);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unionArrays(a: unknown, b: unknown): unknown[] | undefined {
  const aArr = Array.isArray(a) ? a : [];
  const bArr = Array.isArray(b) ? b : [];
  if (aArr.length === 0 && bArr.length === 0) return undefined;
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of [...aArr, ...bArr]) {
    if (typeof item === "string") {
      if (seen.has(item)) continue;
      seen.add(item);
    }
    result.push(item);
  }
  return result;
}

function cleanNullSentinels(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (isPlainObject(value)) {
      const cleaned = cleanNullSentinels(value);
      if (Object.keys(cleaned).length > 0) {
        out[key] = cleaned;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bosConfigMerger = createDefu((obj: any, key: any, value: any): boolean | undefined => {
  if (obj[key] === null) return true;
  if (value === null) {
    obj[key] = null;
    return true;
  }
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    if (ARRAY_UNION_KEYS.has(key)) {
      obj[key] = unionArrays(obj[key], value) as any[];
    } else {
      obj[key] = value;
    }
    return true;
  }
  return false;
});

export function resolveExtendsRef(
  extendsField: string | ExtendsConfig | undefined,
  env: BosEnv,
): string | undefined {
  if (!extendsField) return undefined;
  if (typeof extendsField === "string") return extendsField;
  return extendsField[env] ?? extendsField.production ?? Object.values(extendsField).find(Boolean);
}

export function mergeBosConfigWithExtends(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const merged = bosConfigMerger(child, parent) as Record<string, unknown>;

  if (isPlainObject(parent.plugins) && isPlainObject(child.plugins)) {
    const plugins: Record<string, unknown> = { ...parent.plugins };
    for (const [key, value] of Object.entries(child.plugins as Record<string, unknown>)) {
      if (value === null || value === false) {
        delete plugins[key];
      } else if (isPlainObject(plugins[key]) && isPlainObject(value)) {
        plugins[key] = bosConfigMerger(
          value as Record<string, unknown>,
          plugins[key] as Record<string, unknown>,
        );
      } else {
        plugins[key] = value;
      }
    }
    merged.plugins = plugins;
  } else if (child.plugins !== undefined) {
    merged.plugins = cleanNullSentinels(child.plugins as Record<string, unknown>);
  }

  if (isPlainObject(merged.app)) {
    for (const entryVal of Object.values(merged.app as Record<string, unknown>)) {
      if (!isPlainObject(entryVal)) continue;
      const entry = entryVal as Record<string, unknown>;
      for (const secretKey of ARRAY_UNION_KEYS) {
        if (Array.isArray(entry[secretKey])) {
          entry[secretKey] =
            (unionArrays(entry[secretKey] as unknown[], []) as string[] | undefined)?.filter(
              Boolean,
            ) ?? entry[secretKey];
        }
      }
    }
  }

  if (isPlainObject(merged.plugins)) {
    for (const pluginVal of Object.values(merged.plugins as Record<string, unknown>)) {
      if (!isPlainObject(pluginVal)) continue;
      const plugin = pluginVal as Record<string, unknown>;
      for (const secretKey of ARRAY_UNION_KEYS) {
        if (Array.isArray(plugin[secretKey])) {
          plugin[secretKey] =
            (unionArrays(plugin[secretKey] as unknown[], []) as string[] | undefined)?.filter(
              Boolean,
            ) ?? plugin[secretKey];
        }
      }
    }
  }

  return rebuildOrderedConfig(merged);
}

export function mergeBosConfigWithTemplate(
  local: Record<string, unknown>,
  template: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergeJsonValuesPreservingLocalOrder(local, template) as Record<string, unknown>;
  return rebuildOrderedConfig(merged);
}

function mergeJsonValuesPreservingLocalOrder(local: unknown, template: unknown): unknown {
  if (isPlainObject(local) && isPlainObject(template)) {
    const merged: Record<string, unknown> = {};
    for (const key of Object.keys(local)) {
      merged[key] = mergeJsonValuesPreservingLocalOrder(
        local[key],
        (template as Record<string, unknown>)[key],
      );
    }
    for (const key of Object.keys(template as Record<string, unknown>)) {
      if (!(key in merged)) {
        merged[key] = (template as Record<string, unknown>)[key];
      }
    }
    return merged;
  }
  return local ?? template;
}

export function rebuildOrderedConfig(config: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  for (const key of BOS_CONFIG_ORDER) {
    if (key in config) {
      ordered[key] = config[key];
    }
  }

  for (const key of Object.keys(config)) {
    if (!BOS_CONFIG_ORDER.includes(key as BosConfigFieldName)) {
      ordered[key] = config[key];
    }
  }

  return ordered;
}

export { bosConfigMerger };
