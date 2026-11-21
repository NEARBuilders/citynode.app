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

async function mintAsPlatformAdmin(
  auth: AuthClient,
  input: StandingJoinTarget,
): Promise<string | null> {
  let undo: (() => Promise<unknown>) | null = null;
  try {
    const session = await auth.getSession();
    const userId = session.user?.id;
    if (session.user?.role !== "admin" || !userId) return null;
    const listed = await auth.listMembers({ organizationId: input.organizationId });
    const existing = listed.members.find((member) => member.userId === userId);
    if (!existing) {
      await auth.adminAddMember({
        organizationId: input.organizationId,
        userId,
        role: "admin",
      });
      undo = () => auth.adminRemoveMember({ organizationId: input.organizationId, userId });
    } else if (existing.role !== "admin" && existing.role !== "owner") {
      const previous = existing.role === "owner" ? "owner" : "member";
      await auth.adminAddMember({
        organizationId: input.organizationId,
        userId,
        role: "admin",
      });
      undo = () =>
        auth.adminAddMember({
          organizationId: input.organizationId,
          userId,
          role: previous,
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

export async function ensureCommunityJoinCode(
  nodes: NodesService,
  clients: AuthClient[],
  node: JoinCodeCommunity,
): Promise<string | null> {
  const existing = storedJoinCode(node.metadata);
  if (existing) return existing;
  if (!node.orgId || node.kind === PLATFORM_NODE_KIND || clients.length === 0) return null;
  const minted = await mintJoinCode(clients, {
    organizationId: node.orgId,
    slug: node.slug,
    name: node.name || node.slug,
  });
  if (!minted) return null;
  await Effect.runPromise(nodes.attachJoinCodeIfMissing(node.id, minted));
  const stored = await Effect.runPromise(nodes.getById(node.id));
  return stored ? storedJoinCode(stored.metadata) : null;
}

export function backfillCommunityJoinCodes(
  nodes: NodesService,
  clients: AuthClient[],
): Promise<void> {
  if (clients.length === 0) return Promise.resolve();
  return (async () => {
    const missing = await Effect.runPromise(nodes.listMissingJoinCodes());
    for (const node of missing) {
      await ensureCommunityJoinCode(nodes, clients, node).catch(() => undefined);
    }
  })();
}
