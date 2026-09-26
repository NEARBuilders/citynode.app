import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

export const SANDBOX_LEASES_VERSION = 1;

export interface SandboxTenant {
  readonly account: string;
  readonly gateway: string;
}

export const LeaseSchema = z.object({
  account: z.string(),
  gateway: z.string(),
  slug: z.string(),
  url: z.string(),
  hostPort: z.number(),
  stage: z.string(),
  image: z.string(),
  createdAt: z.string(),
});
export type SandboxLease = z.infer<typeof LeaseSchema>;

const LeaseFileSchema = z.object({
  version: z.number(),
  leases: z.array(LeaseSchema),
});

/**
 * Gateway handoff: the lease file the host's BindingResolver overlays when
 * `BOS_SANDBOX=1`. The alchemy sandbox stack rewrites it on every deploy.
 */
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

export function writeLeases(path: string, leases: readonly SandboxLease[]): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: SANDBOX_LEASES_VERSION, leases }, null, 2)}\n`);
}

export const leaseKey = (tenant: { account: string; gateway: string }): string =>
  `${tenant.account}/${tenant.gateway}`;

export function defaultSlug(account: string): string {
  return (
    account
      .split(".")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") ?? "tenant"
  );
}

export function sanitizeDockerName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 40);
}
