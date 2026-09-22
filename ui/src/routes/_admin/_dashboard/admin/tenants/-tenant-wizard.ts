import { z } from "zod";
import { deriveSlug } from "@/lib/slug";

export { generateSlug } from "@/lib/slug";

export type NearNetworkId = "mainnet" | "testnet";

export type TenantKeyKind = "uuid" | "accountId" | "slug";

export const nodeKinds = ["country", "state", "city"] as const;

export type NodeKind = (typeof nodeKinds)[number];

export const tenantWizardSchema = z
  .object({
    kind: z.enum(nodeKinds),
    parentId: z.string(),
    name: z.string().trim().min(1, "name is required"),
    slug: z
      .string()
      .min(1, "slug is required")
      .regex(/^[a-z0-9-]+$/, "only lowercase letters, numbers, and hyphens"),
    tenantName: z.string().trim().min(1, "tenant name is required"),
  })
  .superRefine((values, context) => {
    if (values.kind !== "country" && !values.parentId) {
      context.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "parent is required",
      });
    }
  });

export type TenantWizardValues = z.infer<typeof tenantWizardSchema>;

export function deriveTenantWizardNameFields(
  name: string,
  current: Pick<TenantWizardValues, "slug" | "tenantName">,
  touched: { slug: boolean; tenantName: boolean },
) {
  return {
    slug: deriveSlug(name, current.slug, touched.slug),
    tenantName: touched.tenantName ? current.tenantName : name,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function classifyTenantKey(key: string): TenantKeyKind {
  if (UUID_REGEX.test(key)) return "uuid";
  if (key.includes(".")) return "accountId";
  return "slug";
}

export interface TenantBindingLike {
  hostname: string;
  isPrimary: boolean;
}

export interface OrganizationLike {
  id: string;
  slug?: string | null;
}

export function resolvePrimaryHostname(
  bindings: readonly TenantBindingLike[] | null | undefined,
): string | null {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const primary = bindings.find((binding) => binding.isPrimary && !!binding.hostname);
  if (primary) return primary.hostname;
  const first = bindings.find((binding) => !!binding.hostname);
  return first?.hostname ?? null;
}

export function resolveOrgSlug(
  organizations: readonly OrganizationLike[] | null | undefined,
  orgId: string | null | undefined,
): string | null {
  if (!orgId || !Array.isArray(organizations)) return null;
  const org = organizations.find((candidate) => candidate.id === orgId);
  return typeof org?.slug === "string" && org.slug ? org.slug : null;
}
