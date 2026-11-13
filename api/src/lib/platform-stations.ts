import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";

type AuthClient = ContractRouterClient<authContract>;

const PLATFORM_ORGANIZATION_KEY = "platformStations";

const conflict = (message: string) => new ORPCError("CONFLICT", { message });

export function isPlatformOrganization(organization: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  return organization.metadata?.[PLATFORM_ORGANIZATION_KEY] === "true";
}

export async function createPlatformOrganization(
  auth: AuthClient,
  input: { name: string; slug: string },
): Promise<{ id: string; name: string; slug: string }> {
  const slugStatus = await auth.checkSlug({ slug: input.slug });
  if (!slugStatus.status) {
    throw conflict("That slug is already used by another organization");
  }
  const organization = await auth.createOrganization({
    name: input.name,
    slug: input.slug,
    metadata: { [PLATFORM_ORGANIZATION_KEY]: "true" },
  });
  return { id: organization.id, name: organization.name, slug: organization.slug };
}
