import { z } from "zod";
import type { ApiClient } from "@/app";

export const nodeApplicationKinds = ["country", "state", "city"] as const;

const nearAccountIdPattern =
  /^(?=.{2,64}$)([a-z0-9]+(?:[-_][a-z0-9]+)*)(\.([a-z0-9]+(?:[-_][a-z0-9]+)*))*$/;

const nodeApplicationFields = {
  kind: z.enum(nodeApplicationKinds),
  parentId: z.string().nullable(),
  name: z.string().trim().min(1, "name is required"),
  slug: z
    .string()
    .min(1, "slug is required")
    .regex(/^[a-z0-9-]+$/, "only lowercase letters, numbers, and hyphens"),
  motivation: z.string().trim().min(1, "motivation is required"),
};

function validateParent(
  value: { kind: (typeof nodeApplicationKinds)[number]; parentId: string | null },
  context: z.RefinementCtx,
) {
  if (value.kind === "country" && value.parentId !== null) {
    context.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "country cannot have a parent",
    });
  }
  if (value.kind !== "country" && !value.parentId) {
    context.addIssue({ code: "custom", path: ["parentId"], message: "parent is required" });
  }
}

export const nodeApplicationSchema = z.object(nodeApplicationFields).superRefine(validateParent);

export const nodeProposalPayloadSchema = z
  .object({
    ...nodeApplicationFields,
    orgId: z.string().min(1),
    accountId: z.string().regex(nearAccountIdPattern),
    submitterAccountId: z.string().regex(nearAccountIdPattern),
  })
  .superRefine(validateParent);

export type NodeApplicationValues = z.infer<typeof nodeApplicationSchema>;
export type NodeProposalPayload = z.infer<typeof nodeProposalPayloadSchema>;

export function generateNodeApplicationSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveNodeApplicationSlug(
  name: string,
  currentSlug: string,
  manuallyEdited: boolean,
) {
  return manuallyEdited ? currentSlug : generateNodeApplicationSlug(name);
}

export function buildNodeProposalPayload(
  values: NodeApplicationValues,
  identity: { orgId: string; accountId: string },
): NodeProposalPayload {
  return nodeProposalPayloadSchema.parse({
    ...values,
    orgId: identity.orgId,
    accountId: identity.accountId,
    submitterAccountId: identity.accountId,
  });
}

export function parseNodeProposalPayload(payload: unknown): NodeProposalPayload {
  return nodeProposalPayloadSchema.parse(payload);
}

export function readSessionNearAccountId(
  user: unknown,
  connectedNearAccountId: string | null = null,
): string | null {
  if (connectedNearAccountId) return connectedNearAccountId;
  if (!user || typeof user !== "object" || !("accounts" in user) || !Array.isArray(user.accounts)) {
    return null;
  }
  for (const account of user.accounts) {
    if (
      account &&
      typeof account === "object" &&
      "providerId" in account &&
      account.providerId === "siwn" &&
      "accountId" in account &&
      typeof account.accountId === "string"
    ) {
      return account.accountId.split(":")[0] || null;
    }
  }
  return null;
}

export function resolveActiveOrganizationLabel(
  activeOrgId: string | null,
  organizations: Array<{ id: string; name: string }>,
) {
  if (!activeOrgId) return "";
  return (
    organizations.find((organization) => organization.id === activeOrgId)?.name ??
    "Active organization"
  );
}

export function getDefaultOrganizationId(
  activeOrgId: string | null,
  organizations: Array<{ id: string }>,
) {
  if (activeOrgId) return null;
  return organizations[0]?.id ?? null;
}

export function canSubmitNodeApplication({
  values,
  orgId,
  accountId,
  hostnameAvailable,
  preflightLoading = false,
  submitting = false,
}: {
  values: NodeApplicationValues;
  orgId: string | null;
  accountId: string | null;
  hostnameAvailable: boolean;
  preflightLoading?: boolean;
  submitting?: boolean;
}) {
  return (
    !!orgId &&
    !!accountId &&
    nodeApplicationSchema.safeParse(values).success &&
    hostnameAvailable &&
    !preflightLoading &&
    !submitting
  );
}

export function proposeNodeApplication(
  apiClient: ApiClient,
  values: NodeApplicationValues,
  identity: { orgId: string; accountId: string },
) {
  const payload = buildNodeProposalPayload(values, identity);
  return apiClient.proposals.propose({
    pluginId: "node",
    entityId: payload.slug,
    payload,
    source: "/apply",
  });
}
