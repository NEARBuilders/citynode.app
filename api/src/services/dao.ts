import { ORPCError } from "every-plugin/orpc";
import { Near } from "near-kit";

export type NearNetworkId = "mainnet" | "testnet";

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

const MAINNET_RPC_URL = "https://rpc.mainnet.near.org";
const TESTNET_RPC_URL = "https://rpc.testnet.near.org";
const GET_POLICY_MAX_RETRIES = 2;

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

export async function verifyDaoMembership({
  daoAccountId,
  memberAccountId,
  network = "mainnet",
}: VerifyDaoMembershipInput): Promise<VerifyDaoMembershipResult> {
  if (!memberAccountId) {
    return { isSputnikContract: false, isMember: false, policy: null };
  }

  const rpcUrl = network === "testnet" ? TESTNET_RPC_URL : MAINNET_RPC_URL;
  const near = new Near({ network: { rpcUrl, networkId: network } });

  let policy: DaoPolicy | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= GET_POLICY_MAX_RETRIES; attempt += 1) {
    try {
      const result = await near.view<DaoPolicy>(daoAccountId, "get_policy", {});
      policy = result ?? null;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!policy) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Target account is not a sputnik-dao contract (get_policy failed)",
      data: { daoAccountId, cause: errorMessage(lastError), network },
    });
  }

  const isMember = isExplicitDaoMember(policy, memberAccountId);
  return { isSputnikContract: true, isMember, policy };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
