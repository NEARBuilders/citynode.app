import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { type NearNetworkId, NearViewCallError, resolveNetwork, viewFunction } from "./near-rpc";

type ApplicantPolicy = { roles?: Array<{ kind?: { Group?: string[] } | string }> };

export function verifyNodeApplicant(
  daoAccountId: string,
  applicantAccountId: string,
  networkId: NearNetworkId,
) {
  const network = resolveNetwork(daoAccountId, networkId);
  return Effect.tryPromise({
    try: async () => {
      const policy = await viewFunction<ApplicantPolicy | null>({
        accountId: daoAccountId,
        methodName: "get_policy",
        network,
      });
      return (
        policy?.roles?.some(
          (role) =>
            typeof role.kind === "object" &&
            Array.isArray(role.kind.Group) &&
            role.kind.Group.includes(applicantAccountId),
        ) === true
      );
    },
    catch: (error) =>
      error instanceof NearViewCallError
        ? new ORPCError("BAD_REQUEST", {
            message: "Unable to verify the proposed Sputnik DAO policy",
            data: { daoAccountId, network, cause: error.kind },
          })
        : new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Couldn't reach NEAR, try again",
            data: { reason: "NEAR_RPC_UNAVAILABLE", daoAccountId, network },
          }),
  });
}
