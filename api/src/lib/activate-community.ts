import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import type { NodesService } from "../services/nodes";
import type { PlacesService } from "../services/places";
import {
  type AuthClient,
  createStandingJoinCode,
  ensureCommunityJoinCode,
} from "./community-join-code";

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
  repairClients: AuthClient[] = [auth],
): Promise<ActivationResult> {
  const resolution = await Effect.runPromise(deps.places.resolve({ place: input.place }));
  if (!resolution) {
    throw new ORPCError("NOT_FOUND", {
      message: "Unknown place",
      data: { place: input.place },
    });
  }
  const place = resolution.place;

  const existing = await existingActivation(deps, place, repairClients);
  if (existing) return existing;

  let organization: { id: string };
  try {
    organization = await auth.createOrganization({ name: place.name, slug: place.slug });
  } catch (error) {
    if (!(error instanceof ORPCError && error.code === "CONFLICT")) throw error;
    const raced = await existingActivation(deps, place, repairClients);
    if (raced) return raced;
    throw new ORPCError("CONFLICT", {
      message: "This community's name is already used by another community",
    });
  }

  const linked = await linkOrganization(deps, auth, repairClients, {
    place,
    organizationId: organization.id,
    userId: input.userId,
  }).catch(async (error) => {
    await auth.deleteOrganization({ organizationId: organization.id }).catch(() => undefined);
    throw error;
  });

  if (!linked.created) {
    await auth.deleteOrganization({ organizationId: organization.id }).catch(() => undefined);
  }

  return {
    nodeId: linked.node.id,
    placeId: place.id,
    slug: place.slug,
    organizationId: linked.created ? organization.id : (linked.node.orgId ?? ""),
    joinCode: linked.joinCode,
    alreadyActivated: !linked.created,
  };
}

async function linkOrganization(
  deps: ActivateCommunityDeps,
  auth: AuthClient,
  repairClients: AuthClient[],
  input: {
    place: { id: string; slug: string; name: string };
    organizationId: string;
    userId: string;
  },
) {
  const joinCode = await createStandingJoinCode(auth, {
    organizationId: input.organizationId,
    slug: input.place.slug,
    name: input.place.name,
  });

  const activation = await Effect.runPromise(
    deps.nodes.activateForPlace({
      placeId: input.place.id,
      orgId: input.organizationId,
      activatedBy: input.userId,
      joinCodeId: joinCode.code,
    }),
  );

  const storedJoinCode = (activation.node.metadata as { joinCodeId?: string } | null)?.joinCodeId;
  const repaired =
    activation.created || storedJoinCode
      ? null
      : await ensureCommunityJoinCode(deps.nodes, repairClients, activation.node);
  return {
    node: activation.node,
    created: activation.created,
    joinCode: activation.created ? joinCode.code : storedJoinCode || repaired || "",
  };
}

async function existingActivation(
  deps: ActivateCommunityDeps,
  place: { id: string; slug: string },
  repairClients: AuthClient[],
): Promise<ActivationResult | null> {
  const existing = await Effect.runPromise(deps.nodes.getByPlace(place.id));
  if (!existing) return null;
  const joinCode = await ensureCommunityJoinCode(deps.nodes, repairClients, existing);
  if (!joinCode) {
    throw new ORPCError("CONFLICT", {
      message: "This community is missing its join code",
    });
  }
  return {
    nodeId: existing.id,
    placeId: place.id,
    slug: place.slug,
    organizationId: existing.orgId ?? "",
    joinCode,
    alreadyActivated: true,
  };
}
