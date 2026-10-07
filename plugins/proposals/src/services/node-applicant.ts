import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { Near } from "near-kit";

export function verifyNodeApplicant(
  daoAccountId: string,
  applicantAccountId: string,
  networkId: "mainnet" | "testnet",
) {
  return Effect.tryPromise({
    try: async () => {
      const near = new Near({
        network: { rpcUrl: `https://rpc.${networkId}.near.org`, networkId },
      });
      const policy = await near.view<{ roles?: Array<{ kind?: { Group?: string[] } | string }> }>(
        daoAccountId,
        "get_policy",
        {},
      );
      return (
        policy?.roles?.some(
          (role) =>
            typeof role.kind === "object" &&
            Array.isArray(role.kind.Group) &&
            role.kind.Group.includes(applicantAccountId),
        ) === true
      );
    },
    catch: () =>
      new ORPCError("BAD_REQUEST", {
        message: "Unable to verify the proposed Sputnik DAO policy",
      }),
  });
}
