import type { OwnerWallet } from "@near-intents-agent-api/contracts";
import {
  createOwnerProofVerifier,
  OwnerAuthError,
  type OwnerMessage,
  type OwnerProof,
} from "@near-intents-agent-api/owner-auth";
import { ApiError } from "./errors.js";
import { verifyNearOwnerProof } from "./near.js";

export { assertOwnerIdentity } from "@near-intents-agent-api/owner-auth";

const verifier = createOwnerProofVerifier({
  verifyNear: {
    verify: async (input) => {
      try {
        await verifyNearOwnerProof(input);
      } catch (error) {
        if (error instanceof ApiError)
          throw new OwnerAuthError(error.code, error.status as 400 | 401 | 403 | 409);
        throw error;
      }
    },
  },
});

/** Public credential metadata comes from the partner site; private keys never enter this API. */
export async function verifyOwnerProof(input: {
  owner: OwnerWallet;
  message: OwnerMessage;
  proof: OwnerProof;
  counter?: number;
}): Promise<number> {
  try {
    return await verifier.verify(input);
  } catch (error) {
    if (error instanceof OwnerAuthError) throw new ApiError(error.code, error.status);
    throw error;
  }
}
