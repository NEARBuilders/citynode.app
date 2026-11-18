import { z } from "zod";
import type { ApiClient } from "@/app";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

const nearAccountIdPattern =
  /^(?=.{2,64}$)([a-z0-9]+(?:[-_][a-z0-9]+)*)(\.([a-z0-9]+(?:[-_][a-z0-9]+)*))*$/;

export function createNodeApplicationSchema(t: AppTranslator) {
  return z.object({
    motivation: z.string().trim().min(1, t("application.motivationRequired")),
  });
}
export const nodeApplicationSchema = createNodeApplicationSchema(translateEnglishAppMessage);

export const nodeProposalPayloadSchema = z.object({
  placeId: z.string().optional(),
  name: z.string().trim().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  motivation: z.string().trim().min(1),
  accountId: z.string().regex(nearAccountIdPattern),
  submitterAccountId: z.string().regex(nearAccountIdPattern).optional(),
});

export type NodeApplicationValues = z.infer<typeof nodeApplicationSchema>;
export type NodeProposalPayload = z.infer<typeof nodeProposalPayloadSchema>;

export interface ApplicationPlace {
  id: string;
  slug: string;
  name: string;
}

export function buildNodeProposalPayload(
  values: NodeApplicationValues,
  place: ApplicationPlace,
  identity: { daoAccountId: string; submitterAccountId: string },
): NodeProposalPayload & { placeId: string } {
  return {
    ...nodeProposalPayloadSchema.parse({
      placeId: place.id,
      name: place.name,
      slug: place.slug,
      motivation: values.motivation,
      accountId: identity.daoAccountId,
      submitterAccountId: identity.submitterAccountId,
    }),
    placeId: place.id,
  };
}

export function parseNodeProposalPayload(payload: unknown): NodeProposalPayload {
  return nodeProposalPayloadSchema.parse(payload);
}

export function canSubmitNodeApplication({
  values,
  place,
  daoAccountId,
  submitterAccountId,
  submitting = false,
}: {
  values: NodeApplicationValues;
  place: ApplicationPlace | null;
  daoAccountId: string | null;
  submitterAccountId: string | null;
  submitting?: boolean;
}) {
  return (
    !!place &&
    !!daoAccountId &&
    !!submitterAccountId &&
    nodeApplicationSchema.safeParse(values).success &&
    !submitting
  );
}

export async function proposeNodeApplication(
  apiClient: ApiClient,
  values: NodeApplicationValues,
  place: ApplicationPlace & { activated: boolean },
  identity: { daoAccountId: string; submitterAccountId: string },
) {
  if (!place.activated) await apiClient.activateCommunity({ place: place.slug });
  const payload = buildNodeProposalPayload(values, place, identity);
  return apiClient.proposals.propose({
    pluginId: "node",
    entityId: payload.slug,
    payload,
    source: "/apply",
    idempotencyKey: crypto.randomUUID(),
  });
}

export function myNodeApplicationsQueryOptions(apiClient: ApiClient, applicantAccountId: string) {
  return {
    queryKey: ["my-node-applications", applicantAccountId] as const,
    queryFn: () => apiClient.proposals.getMyNodeApplications(),
    enabled: !!applicantAccountId,
  };
}
