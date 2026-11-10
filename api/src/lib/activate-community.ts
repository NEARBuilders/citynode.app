import type { ContractRouterClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import type { ContractType as authContract } from "../../../.bos/generated/auth/contract.d.ts";
import type { NodesService } from "../services/nodes";
import type { PlacesService } from "../services/places";

type AuthClient = ContractRouterClient<authContract>;

export interface ActivateCommunityDeps {
  places: PlacesService;
  nodes: NodesService;
}

export interface ActivationResult {
  nodeId: string;
  placeId: string;
  slug: string;
  organizationId: string;
  joinCode: string;
  alreadyActivated: boolean;
}

export async function activateCommunity(
  deps: ActivateCommunityDeps,
  auth: AuthClient,
  input: { place: string; userId: string },
): Promise<ActivationResult> {
  const resolution = await Effect.runPromise(deps.places.resolve({ place: input.place }));
  if (!resolution) {
    throw new ORPCError("NOT_FOUND", {
      message: "Unknown place",
      data: { place: input.place },
    });
  }
  const place = resolution.place;

  const existing = await Effect.runPromise(deps.nodes.getByPlace(place.id));
  if (existing) {
    const joinCodeId = (existing.metadata as { joinCodeId?: string } | null)?.joinCodeId;
    if (!joinCodeId) {
      throw new ORPCError("CONFLICT", {
        message: "This community is missing its join code",
      });
    }
    return {
      nodeId: existing.id,
      placeId: place.id,
      slug: place.slug,
      organizationId: existing.orgId ?? "",
      joinCode: joinCodeId,
      alreadyActivated: true,
    };
  }

  const organization = await auth
    .createOrganization({ name: place.name, slug: place.slug })
    .catch((error) => {
      if (error instanceof ORPCError && error.code === "CONFLICT") {
        throw new ORPCError("CONFLICT", {
          message: "This community's name is already used by another organization",
        });
      }
      throw error;
    });

  const joinCode = await auth.createOnboardingCode({
    organizationId: organization.id,
    eventId: `join:${place.slug}`,
    eventName: `Join ${place.name}`,
  });

  const activation = await Effect.runPromise(
    deps.nodes.activateForPlace({
      placeId: place.id,
      slug: place.slug,
      name: place.name,
      orgId: organization.id,
      activatedBy: input.userId,
      joinCodeId: joinCode.code,
    }),
  );

  return {
    nodeId: activation.node.id,
    placeId: place.id,
    slug: place.slug,
    organizationId: organization.id,
    joinCode: joinCode.code,
    alreadyActivated: !activation.created,
  };
}
