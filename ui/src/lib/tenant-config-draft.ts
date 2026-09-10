/**
 * Pure helpers for the org node-config editor: a validated draft of the
 * fields a tenant may customize in its published bos.config.json, prefilled
 * from the currently published config, diffed against it, and an in-browser
 * sha384 preflight so a wrong UI bundle cannot brick the tenant site.
 */

import { z } from "zod";
import type { TenantUiOverride } from "./dao-policy";

export const INTEGRITY_PATTERN = /^sha384-[A-Za-z0-9+/=]+$/;

const optionalUrl = z
  .string()
  .trim()
  .url("must be a valid URL")
  .or(z.literal(""))
  .transform((value) => value.trim());

const optionalIntegrity = z
  .string()
  .trim()
  .regex(INTEGRITY_PATTERN, "must look like sha384-… (base64)")
  .or(z.literal(""));

export const tenantConfigDraftSchema = z
  .object({
    title: z.string().trim().min(1, "title is required"),
    description: z.string().trim().min(1, "description is required"),
    repository: optionalUrl,
    uiProduction: optionalUrl,
    uiIntegrity: optionalIntegrity,
    ssrUrl: optionalUrl,
    ssrIntegrity: optionalIntegrity,
  })
  .refine((draft) => !!draft.uiProduction === !!draft.uiIntegrity, {
    message: "a UI bundle needs both its URL and its integrity hash",
    path: ["uiIntegrity"],
  })
  .refine((draft) => !!draft.ssrUrl === !!draft.ssrIntegrity, {
    message: "an SSR bundle needs both its URL and its integrity hash",
    path: ["ssrIntegrity"],
  });

export type TenantConfigDraft = z.infer<typeof tenantConfigDraftSchema>;

export const emptyTenantConfigDraft: TenantConfigDraft = {
  title: "",
  description: "",
  repository: "",
  uiProduction: "",
  uiIntegrity: "",
  ssrUrl: "",
  ssrIntegrity: "",
};

interface ResolvedUiConfig {
  production?: unknown;
  integrity?: unknown;
  ssr?: unknown;
  ssrIntegrity?: unknown;
}

function readUi(resolvedConfig: Record<string, unknown> | null | undefined): ResolvedUiConfig {
  const app = resolvedConfig?.app as { ui?: ResolvedUiConfig } | undefined;
  return app?.ui ?? {};
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

export function buildDraftFromResolvedConfig(
  resolvedConfig: Record<string, unknown> | null | undefined,
  fallback: { title: string },
): TenantConfigDraft {
  const ui = readUi(resolvedConfig);
  const title = asString(resolvedConfig?.title) || fallback.title;
  return {
    title,
    description: asString(resolvedConfig?.description) || title,
    repository: asString(resolvedConfig?.repository),
    uiProduction: asString(ui.production),
    uiIntegrity: asString(ui.integrity),
    ssrUrl: asString(ui.ssr),
    ssrIntegrity: asString(ui.ssrIntegrity),
  };
}

export interface DraftDiffEntry {
  field: string;
  from: string;
  to: string;
}

export function diffDraft(
  draft: TenantConfigDraft,
  resolvedConfig: Record<string, unknown> | null | undefined,
): DraftDiffEntry[] {
  const ui = readUi(resolvedConfig);
  const pairs: [string, string, string][] = [
    ["title", asString(resolvedConfig?.title), draft.title],
    ["description", asString(resolvedConfig?.description), draft.description],
    ["repository", asString(resolvedConfig?.repository), draft.repository],
    ["ui bundle", asString(ui.production), draft.uiProduction],
    ["ui integrity", asString(ui.integrity), draft.uiIntegrity],
    ["ssr bundle", asString(ui.ssr), draft.ssrUrl],
    ["ssr integrity", asString(ui.ssrIntegrity), draft.ssrIntegrity],
  ];
  return pairs
    .filter(([, from, to]) => from !== to)
    .map(([field, from, to]) => ({ field, from: from || "—", to: to || "—" }));
}

/** The `app` block for the published config, or undefined when no UI override is set. */
export function draftUiOverride(draft: TenantConfigDraft): { ui: TenantUiOverride } | undefined {
  if (!draft.uiProduction || !draft.uiIntegrity) return undefined;
  return {
    ui: {
      production: draft.uiProduction,
      integrity: draft.uiIntegrity,
      ...(draft.ssrUrl && draft.ssrIntegrity
        ? { ssr: draft.ssrUrl, ssrIntegrity: draft.ssrIntegrity }
        : {}),
    },
  };
}

export type IntegrityCheckResult =
  | { status: "match" }
  | { status: "mismatch"; computed: string }
  | { status: "unverified"; reason: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function computeSubresourceIntegrity(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`fetching the bundle returned ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-384", buffer);
  return `sha384-${toBase64(new Uint8Array(digest))}`;
}

export async function verifyUiIntegrity(
  url: string,
  expected: string,
): Promise<IntegrityCheckResult> {
  try {
    const computed = await computeSubresourceIntegrity(url);
    return computed === expected ? { status: "match" } : { status: "mismatch", computed };
  } catch (error) {
    return {
      status: "unverified",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
