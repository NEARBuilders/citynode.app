import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";
import { hasJoinCode, type NodesService, PLATFORM_NODE_KIND } from "../services/nodes";

export type AuthClient = ContractRouterClient<authContract>;

const STANDING_JOIN_CODE_MAX_USES = 500;
const STANDING_JOIN_CODE_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export interface JoinCodeCommunity {
  id: string;
  orgId: string | null;
  slug: string;
  name: string;
  kind: string | null;
  metadata: Record<string, unknown>;
}

interface StandingJoinTarget {
  organizationId: string;
  slug: string;
  name: string;
}

export function createStandingJoinCode(auth: AuthClient, input: StandingJoinTarget) {
  return auth.createOnboardingCode({
    organizationId: input.organizationId,
    eventId: `join:${input.slug}`,
    eventName: `Join ${input.name}`,
    maxUses: STANDING_JOIN_CODE_MAX_USES,
    expiresAt: new Date(Date.now() + STANDING_JOIN_CODE_LIFETIME_MS),
  });
}

function storedJoinCode(metadata: unknown): string | null {
  if (!hasJoinCode(metadata)) return null;
  return (metadata as { joinCodeId: string }).joinCodeId;
}

function denied(error: unknown): boolean {
  return (
    error instanceof ORPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
  );
}

function hiddenMembership(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED" || error.code === "NOT_FOUND")
  );
}

function managesOrganization(role: string): boolean {
  return role.split(",").some((entry) => entry.trim() === "owner" || entry.trim() === "admin");
}

async function mintAsPlatformAdmin(
  auth: AuthClient,
  input: StandingJoinTarget,
): Promise<string | null> {
  let undo: (() => Promise<unknown>) | null = null;
  try {
    const session = await auth.getSession();
    const userId = session.user?.id;
    if (session.user?.role !== "admin" || !userId) return null;
    const members = await auth
      .listMembers({ organizationId: input.organizationId })
      .then((result) => result.members)
      .catch((error: unknown) => {
        if (hiddenMembership(error)) return [];
        throw error;
      });
    const existing = members.find((member) => member.userId === userId);
    if (!existing) {
      await auth.adminAddMember({
        organizationId: input.organizationId,
        userId,
        role: "admin",
      });
      undo = () => auth.adminRemoveMember({ organizationId: input.organizationId, userId });
    } else if (!managesOrganization(existing.role)) {
      await auth.adminUpdateMemberRole({
        organizationId: input.organizationId,
        userId,
        role: "admin",
      });
      const previous = existing.role;
      undo = () =>
        auth.adminUpdateMemberRole({
          organizationId: input.organizationId,
          userId,
          role: previous as "admin" | "member" | "owner",
        });
    }
    const created = await createStandingJoinCode(auth, input);
    return created.code;
  } catch {
    return null;
  } finally {
    if (undo) await undo().catch(() => undo?.().catch(() => undefined));
  }
}

async function mintJoinCode(
  clients: AuthClient[],
  input: StandingJoinTarget,
): Promise<string | null> {
  for (const auth of clients) {
    try {
      const created = await createStandingJoinCode(auth, input);
      return created.code;
    } catch (error) {
      if (!denied(error)) continue;
      const elevated = await mintAsPlatformAdmin(auth, input);
      if (elevated) return elevated;
    }
  }
  return null;
}

const ensuring = new Map<string, Promise<string | null>>();
const BACKFILL_COOLDOWN_MS = 60_000;
let backfillInFlight: Promise<void> | null = null;
let backfillReadyAt = 0;

async function repairCommunityJoinCode(
  nodes: NodesService,
  clients: AuthClient[],
  node: JoinCodeCommunity,
): Promise<string | null> {
  const minted = await mintJoinCode(clients, {
    organizationId: node.orgId ?? "",
    slug: node.slug,
    name: node.name || node.slug,
  });
  if (!minted) return null;
  await Effect.runPromise(nodes.attachJoinCodeIfMissing(node.id, minted));
  const stored = await Effect.runPromise(nodes.getById(node.id));
  return stored ? storedJoinCode(stored.metadata) : null;
}

async function afterSharedRepair(
  nodes: NodesService,
  clients: AuthClient[],
  node: JoinCodeCommunity,
  pending: Promise<string | null>,
): Promise<string | null> {
  const joined = await pending;
  if (joined) return joined;
  const stored = await Effect.runPromise(nodes.getById(node.id));
  const code = stored ? storedJoinCode(stored.metadata) : null;
  if (code || !stored) return code;
  return ensureCommunityJoinCode(nodes, clients, stored);
}

export function ensureCommunityJoinCode(
  nodes: NodesService,
  clients: AuthClient[],
  node: JoinCodeCommunity,
): Promise<string | null> {
  const existing = storedJoinCode(node.metadata);
  if (existing) return Promise.resolve(existing);
  if (!node.orgId || node.kind === PLATFORM_NODE_KIND || clients.length === 0) {
    return Promise.resolve(null);
  }
  const pending = ensuring.get(node.id);
  if (pending) return afterSharedRepair(nodes, clients, node, pending);
  let settle: (code: string | null) => void = () => undefined;
  const gate = new Promise<string | null>((resolve) => {
    settle = resolve;
  });
  ensuring.set(node.id, gate);
  const finish = (code: string | null) => {
    if (ensuring.get(node.id) === gate) ensuring.delete(node.id);
    settle(code);
    return code;
  };
  return repairCommunityJoinCode(nodes, clients, node)
    .then((code) => finish(code))
    .catch((error: unknown) => {
      finish(null);
      throw error;
    });
}

export function backfillCommunityJoinCodes(
  nodes: NodesService,
  clients: AuthClient[],
): Promise<void> {
  if (clients.length === 0) return Promise.resolve();
  if (backfillInFlight) return backfillInFlight;
  if (Date.now() < backfillReadyAt) return Promise.resolve();
  const run = (async () => {
    try {
      const missing = await Effect.runPromise(nodes.listMissingJoinCodes());
      for (const node of missing) {
        await ensureCommunityJoinCode(nodes, clients, node).catch(() => undefined);
      }
    } finally {
      backfillReadyAt = Date.now() + BACKFILL_COOLDOWN_MS;
    }
  })();
  backfillInFlight = run.finally(() => {
    backfillInFlight = null;
  });
  return backfillInFlight;
}

export function scheduleCommunityJoinCodeBackfill(
  nodes: NodesService,
  clients: AuthClient[],
): void {
  void backfillCommunityJoinCodes(nodes, clients).catch(() => undefined);
}
