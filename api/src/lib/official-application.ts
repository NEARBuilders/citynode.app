import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";
import { OfficialApplicationPayloadSchema } from "../contract";
import { resolveNetwork } from "../services/near-rpc";
import type { NodeRecord, NodesService } from "../services/nodes";
import type { PlacesService } from "../services/places";

type AuthClient = ContractRouterClient<authContract>;

export interface OfficialApplicationDeps {
  places: PlacesService;
  nodes: NodesService;
}

export interface OfficialDaoLink {
  nodeId: string;
  organizationId: string;
  daoAccountId: string;
  network: "mainnet" | "testnet";
}

const isHidden = (error: unknown) =>
  error instanceof ORPCError &&
  (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED" || error.code === "NOT_FOUND");

const managesOrganization = (role: string) =>
  role.split(",").some((entry) => ["owner", "admin"].includes(entry.trim()));

export function parseOfficialApplication(payload: unknown, entityId: string) {
  const parsed = OfficialApplicationPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.slug !== entityId) {
    throw new ORPCError("BAD_REQUEST", { message: "Invalid saved community application" });
  }
  return parsed.data;
}

export async function resolveApplicationCommunity(
  deps: OfficialApplicationDeps,
  application: { placeId?: string; slug: string },
): Promise<NodeRecord & { orgId: string }> {
  const placeId =
    application.placeId ??
    (await Effect.runPromise(deps.places.resolve({ place: application.slug })))?.place.id;
  const node = placeId ? await Effect.runPromise(deps.nodes.getByPlace(placeId)) : null;
  if (!node?.orgId) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "This place has no community yet. Activate it before approving the application.",
    });
  }
  return { ...node, orgId: node.orgId };
}

async function ensureReviewerAdmin(
  auth: AuthClient,
  organizationId: string,
  reviewerUserId: string,
) {
  try {
    const { members } = await auth.listMembers({ organizationId });
    const reviewer = members.find((member) => member.userId === reviewerUserId);
    if (reviewer && managesOrganization(reviewer.role)) return;
    if (reviewer) {
      await auth.updateMemberRole({ memberId: reviewer.id, role: "admin", organizationId });
      return;
    }
  } catch (error) {
    if (!isHidden(error)) throw error;
  }
  await auth.addMember({ userId: reviewerUserId, role: "admin", organizationId });
}

export async function linkOfficialDao(
  deps: OfficialApplicationDeps,
  auth: AuthClient,
  input: {
    community: NodeRecord & { orgId: string };
    daoAccountId: string;
    reviewerUserId: string;
  },
): Promise<OfficialDaoLink> {
  const organizationId = input.community.orgId;
  const network = resolveNetwork(input.daoAccountId);
  await ensureReviewerAdmin(auth, organizationId, input.reviewerUserId);
  const linked = await auth.getDao({ organizationId });
  if (linked.daoAccountId && linked.daoAccountId !== input.daoAccountId) {
    throw new ORPCError("CONFLICT", {
      message: `This community is already linked to ${linked.daoAccountId}`,
    });
  }
  if (linked.daoAccountId !== input.daoAccountId || linked.daoNetwork !== network) {
    await auth.linkDao({ organizationId, daoAccountId: input.daoAccountId, daoNetwork: network });
  }
  await Effect.runPromise(
    deps.nodes.recordOfficialDao(input.community.id, {
      accountId: input.daoAccountId,
      network,
    }),
  );
  return {
    nodeId: input.community.id,
    organizationId,
    daoAccountId: input.daoAccountId,
    network,
  };
}

export function officialDaoOf(node: NodeRecord) {
  if (node.tenantId || !node.orgId) return null;
  const { daoAccountId, daoNetwork } = node.metadata as {
    daoAccountId?: unknown;
    daoNetwork?: unknown;
  };
  if (typeof daoAccountId !== "string" || !daoAccountId) return null;
  return {
    daoAccountId,
    network: daoNetwork === "testnet" ? ("testnet" as const) : ("mainnet" as const),
  };
}
