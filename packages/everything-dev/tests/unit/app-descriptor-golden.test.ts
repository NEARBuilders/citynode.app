import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import everythingDevApp from "../../../../bos.app";
import citynodeApp from "../../../../bos.citynode.app";
import { resolveApp } from "../../src/descriptor/resolve";
import type { BosConfigInput } from "../../src/types";

const REPO_ROOT = join(import.meta.dirname, "../../../..");
const PIPELINE_FIELDS = ["production", "integrity", "ssr", "ssrIntegrity"] as const;

function stripPipeline(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPipeline);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (!PIPELINE_FIELDS.includes(key as (typeof PIPELINE_FIELDS)[number])) {
        out[key] = stripPipeline(val);
      }
    }
    return out;
  }
  return value;
}

/**
 * Canonicalize today's hand-maintained config into the generator's form.
 * Two differences exist between the hand-written file and the generated
 * shape, both matching the merge machinery's behavior exactly:
 * - pipeline-owned state (deploy-written URLs + SRI) is stripped everywhere;
 * - the top-level `plugins` record passes through cleanNullSentinels, which
 *   drops empty-object fields (hand-written `variables: {}`) — the upgrade
 *   codemod cleans the file; `app.*` entries are untouched.
 */
function canonicalize(value: unknown): unknown {
  const stripped = stripPipeline(value);
  if (typeof stripped === "object" && stripped !== null && "plugins" in stripped) {
    const plugins = (stripped as Record<string, unknown>).plugins;
    if (typeof plugins === "object" && plugins !== null) {
      (stripped as Record<string, unknown>).plugins = cleanNullSentinels(
        plugins as Record<string, unknown>,
      );
    }
  }
  return stripped;
}

function cleanNullSentinels(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleaned = cleanNullSentinels(value);
      if (Object.keys(cleaned).length > 0) out[key] = cleaned;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function readBosConfig(): BosConfigInput {
  return JSON.parse(readFileSync(join(REPO_ROOT, "bos.config.json"), "utf8")) as BosConfigInput;
}

describe("descriptor golden fixture — bos.app.ts ↔ bos.config.json", () => {
  it("the everything.dev base resolves to local-ref composition", () => {
    const resolved = resolveApp("everything.dev", { "everything.dev": everythingDevApp });
    expect(resolved.account).toBe("dev.everything.near");
    expect(resolved.domain).toBe("everything.dev");
    expect(resolved.app?.host).toEqual({ development: "local:host" });
    expect(resolved.app?.auth).toMatchObject({
      name: "@everything-dev/auth-plugin",
      development: "local:plugins/auth",
    });
    expect(resolved.extends).toBeUndefined();
  });

  it("the citynode runtime flattens to today's authored bos.config.json", () => {
    const resolved = resolveApp("citynode.app", { "citynode.app": citynodeApp });
    expect(resolved).toEqual<BosConfigInput>(canonicalize(readBosConfig()) as BosConfigInput);
  });

  it("the child inherits base slots it does not override", () => {
    const resolved = resolveApp("citynode.app", { "citynode.app": citynodeApp });
    // inherited from the everything.dev base: the apps plugin's composition
    // (the child re-declares it locally — registryNamespace is the base's)
    expect(resolved.plugins?.apps).toMatchObject({ development: "local:plugins/apps" });
  });
});
