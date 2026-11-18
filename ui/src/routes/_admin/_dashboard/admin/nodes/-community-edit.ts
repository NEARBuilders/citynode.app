import type { ApiClient } from "@/app";
import { type DiscoveryProfile, validateProfile } from "@/components/discovery/profile-fields";
import type { AppMessageId } from "@/i18n/catalogs";
import { parseNodeMetadata } from "./-node-management";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export interface CommunityDraft {
  description: string;
  metadata: string;
  profile: DiscoveryProfile | null;
}

export type CommunityDraftField = "metadata" | "profile";

export type CommunitySavePlan =
  | { ok: false; field: CommunityDraftField; issue: AppMessageId }
  | {
      ok: true;
      node?: { nodeId: string; metadata: Record<string, unknown> };
      profile?: DiscoveryProfile;
    };

export function communityDraftFrom(node: Node, profile: DiscoveryProfile | null): CommunityDraft {
  const { description, ...additional } = node.metadata;
  return {
    description: typeof description === "string" ? description : "",
    metadata: JSON.stringify(additional, null, 2),
    profile,
  };
}

export function planCommunitySave(
  nodeId: string,
  initial: CommunityDraft,
  draft: CommunityDraft,
): CommunitySavePlan {
  let metadata: Record<string, unknown>;
  try {
    metadata = parseNodeMetadata(draft.metadata, draft.description);
  } catch {
    return { ok: false, field: "metadata", issue: "admin.community.metadataInvalid" };
  }
  if (draft.profile) {
    const issue = validateProfile(draft.profile);
    if (issue) return { ok: false, field: "profile", issue };
  }
  const nodeChanged =
    draft.description.trim() !== initial.description.trim() || draft.metadata !== initial.metadata;
  const profileChanged =
    !!draft.profile && JSON.stringify(draft.profile) !== JSON.stringify(initial.profile);
  return {
    ok: true,
    ...(nodeChanged ? { node: { nodeId, metadata } } : {}),
    ...(profileChanged && draft.profile ? { profile: draft.profile } : {}),
  };
}

export type CommunitySaveReady = Extract<CommunitySavePlan, { ok: true }>;

export interface CommunitySaveResult {
  savedProfile?: DiscoveryProfile;
  nodeError?: unknown;
  profileError?: unknown;
}

export async function saveCommunityEdits(
  api: Pick<ApiClient, "updateNode" | "saveDiscoveryProfile">,
  plan: CommunitySaveReady,
): Promise<CommunitySaveResult> {
  const [node, profile] = await Promise.allSettled([
    plan.node ? api.updateNode(plan.node) : Promise.resolve(undefined),
    plan.profile ? api.saveDiscoveryProfile(plan.profile) : Promise.resolve(undefined),
  ]);
  return {
    ...(node.status === "rejected" ? { nodeError: node.reason } : {}),
    ...(profile.status === "rejected"
      ? { profileError: profile.reason }
      : profile.value
        ? { savedProfile: profile.value }
        : {}),
  };
}
