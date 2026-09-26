import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Effect } from "effect";
import { z } from "zod";
import {
  SANDBOX_LEASES_VERSION,
  SandboxError,
  type SandboxLease,
  type SandboxLeaseFile,
} from "./types";

const LeaseSchema = z.object({
  account: z.string(),
  gateway: z.string(),
  slug: z.string(),
  url: z.string(),
  proxyUrlAlias: z.string().optional(),
  hostPort: z.number(),
  pgPort: z.number(),
  image: z.string(),
  imageDigest: z.string().nullable(),
  containers: z.array(z.string()),
  network: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});

const LeaseFileSchema = z.object({
  version: z.number(),
  leases: z.array(LeaseSchema),
});

export function sandboxLeasesPath(configDir?: string): string {
  const override = process.env.BOS_SANDBOX_LEASES;
  if (override) {
    return isAbsolute(override) ? override : resolve(override);
  }
  if (configDir) {
    return join(resolve(configDir), ".bos", "sandboxes.json");
  }
  return join(homedir(), ".bos", "sandboxes.json");
}

export function readLeases(path: string): readonly SandboxLease[] {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = LeaseFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.leases : [];
  } catch {
    return [];
  }
}

export function writeLeases(
  path: string,
  leases: readonly SandboxLease[],
): Effect.Effect<void, SandboxError> {
  return Effect.try({
    try: () => {
      mkdirSync(dirname(path), { recursive: true });
      const file: SandboxLeaseFile = { version: SANDBOX_LEASES_VERSION, leases };
      writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    },
    catch: (cause) =>
      new SandboxError({ reason: `failed to write ${path}`, phase: "lease-store", cause }),
  });
}

export const leaseKey = (tenant: { account: string; gateway: string }): string =>
  `${tenant.account}/${tenant.gateway}`;

export function upsertLease(
  leases: readonly SandboxLease[],
  lease: SandboxLease,
): readonly SandboxLease[] {
  const key = leaseKey(lease);
  return [...leases.filter((l) => leaseKey(l) !== key), lease];
}

export function removeLease(
  leases: readonly SandboxLease[],
  tenant: { account: string; gateway: string },
): readonly SandboxLease[] {
  const key = leaseKey(tenant);
  return leases.filter((l) => leaseKey(l) !== key);
}

export function defaultSlug(account: string): string {
  return (
    account
      .split(".")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") ?? "tenant"
  );
}

export function sanitizeContainerPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 40);
}
