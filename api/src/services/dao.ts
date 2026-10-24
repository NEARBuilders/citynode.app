import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import {
  type NearNetworkId,
  NearRpcUnavailableError,
  NearViewCallError,
  resolveNetwork,
  viewFunction,
} from "./near-rpc";

export type { NearNetworkId } from "./near-rpc";

export interface PolicyRoleGroup {
  kind: { Group: string[] };
  name: string;
}

export interface PolicyRoleEveryone {
  kind: "Everyone";
  name: string;
}

export type PolicyRole = PolicyRoleGroup | PolicyRoleEveryone;

export interface DaoPolicy {
  roles: PolicyRole[];
}

export const NEAR_UNAVAILABLE_MESSAGE = "Couldn't reach NEAR, try again";

export function parsePolicyGroupMembers(policy: unknown): string[] {
  if (!policy || typeof policy !== "object") return [];
  const raw = policy as Partial<DaoPolicy>;
  if (!Array.isArray(raw.roles)) return [];
  const members = new Set<string>();
  for (const role of raw.roles) {
    if (!role || typeof role !== "object") continue;
    const kind = (role as { kind?: unknown }).kind;
    if (!kind || typeof kind !== "object") continue;
    const list = (kind as { Group?: unknown }).Group;
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      if (typeof id === "string" && id.length > 0) {
        members.add(id);
      }
    }
  }
  return [...members];
}

export function isExplicitDaoMember(policy: unknown, accountId: string): boolean {
  return parsePolicyGroupMembers(policy).includes(accountId);
}

export interface VerifyDaoMembershipInput {
  daoAccountId: string;
  memberAccountId: string | null | undefined;
  network?: NearNetworkId;
}

export interface VerifyDaoMembershipResult {
  isSputnikContract: boolean;
  isMember: boolean;
  policy: DaoPolicy | null;
}

export const verifyDaoMembership = ({
  daoAccountId,
  memberAccountId,
  network,
}: VerifyDaoMembershipInput): Effect.Effect<
  VerifyDaoMembershipResult,
  ORPCError<string, unknown>
> =>
  Effect.gen(function* () {
    if (!memberAccountId) {
      return { isSputnikContract: false, isMember: false, policy: null };
    }

    const resolvedNetwork = resolveNetwork(daoAccountId, network);
    const policy = yield* Effect.tryPromise({
      try: () =>
        viewFunction<unknown>({
          accountId: daoAccountId,
          methodName: "get_policy",
          network: resolvedNetwork,
        }),
      catch: (error) => daoPolicyError(error, daoAccountId, resolvedNetwork),
    });

    if (!policy || typeof policy !== "object" || !Array.isArray((policy as DaoPolicy).roles)) {
      return yield* Effect.fail(
        notSputnikError(daoAccountId, resolvedNetwork, "get_policy returned no roles"),
      );
    }

    const isMember = isExplicitDaoMember(policy, memberAccountId);
    return { isSputnikContract: true, isMember, policy: policy as DaoPolicy };
  });

function notSputnikError(daoAccountId: string, network: NearNetworkId, cause: string) {
  return new ORPCError("BAD_REQUEST", {
    message: "Target account is not a sputnik-dao contract (get_policy failed)",
    data: { daoAccountId, cause, network },
  });
}
export function daoPolicyError(
  error: unknown,
  daoAccountId: string,
  network: NearNetworkId,
): ORPCError<string, unknown> {
  if (error instanceof NearViewCallError) {
    return notSputnikError(daoAccountId, network, `${error.kind}: ${error.detail}`);
  }
  return new ORPCError("SERVICE_UNAVAILABLE", {
    message: NEAR_UNAVAILABLE_MESSAGE,
    data: {
      reason: "NEAR_RPC_UNAVAILABLE",
      daoAccountId,
      network,
      cause: error instanceof NearRpcUnavailableError ? error.message : String(error),
    },
  });
}
