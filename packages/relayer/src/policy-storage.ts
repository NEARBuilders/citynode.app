import type { JsonRpcProvider } from "near-api-js";

/** OutLayer refunds excess storage to the controller, not the transaction sponsor. */
export async function policyStorageDeposit(
  provider: Pick<JsonRpcProvider, "callFunction">,
  contractId: string,
  senderId: string,
  argsBase64: string,
  maximum: string,
  refundToController = false,
) {
  const args = JSON.parse(Buffer.from(argsBase64, "base64").toString("utf8")) as {
    wallet_pubkey: string;
    encrypted_data: string;
  };
  const previous = await provider.callFunction<{
    owner: string;
    encrypted_data: string;
  }>({
    contractId,
    method: "get_wallet_policy",
    args: { wallet_pubkey: args.wallet_pubkey },
    blockQuery: { finality: "final" },
  });
  if (previous && previous.owner !== senderId) throw new Error("policy_owner_mismatch");
  const estimate = async (encryptedData: string) => {
    const amount = await provider.callFunction<string>({
      contractId,
      method: "estimate_wallet_policy_cost",
      args: { wallet_pubkey: args.wallet_pubkey, encrypted_data: encryptedData },
      blockQuery: { finality: "final" },
    });
    if (typeof amount !== "string" || !/^[0-9]+$/.test(amount))
      throw new Error("policy_storage_estimate_invalid");
    return BigInt(amount);
  };
  const required = await estimate(args.encrypted_data);
  const existing = previous ? await estimate(previous.encrypted_data) : 0n;
  // A shrinking policy refunds existing storage to the owner even with zero deposit.
  // The deployed contract has no sponsor refund recipient. Do not fund the owner silently.
  if (required < existing && !refundToController) throw new Error("policy_storage_refund_required");
  const deposit = required > existing ? required - existing : 0n;
  if (deposit > BigInt(maximum)) throw new Error("policy_deposit_limit");
  return deposit.toString();
}
