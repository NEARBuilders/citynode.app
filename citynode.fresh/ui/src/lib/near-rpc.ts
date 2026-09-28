import { base64 } from "@scure/base";
import { z } from "zod";

const viewResponseSchema = z.object({
  error: z.never().optional(),
  result: z.object({ result: z.array(z.number().int().min(0).max(255)).min(1) }),
});

export async function callViewFunction(
  accountId: string,
  methodName: string,
  args: Record<string, unknown>,
  network = "mainnet",
): Promise<unknown | null> {
  if (network !== "mainnet" && network !== "testnet") return null;

  try {
    const response = await fetch(`https://rpc.${network}.near.org`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "stake-pool",
        method: "query",
        params: {
          request_type: "call_function",
          account_id: accountId,
          method_name: methodName,
          args_base64: base64.encode(new TextEncoder().encode(JSON.stringify(args))),
          finality: "final",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const raw = viewResponseSchema.parse(await response.json());
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw.result.result)),
    );
  } catch {
    return null;
  }
}
