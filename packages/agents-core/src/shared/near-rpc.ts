import { nearRpcRetryOptions } from "@near-intents-agent-api/relayer";
import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import { getRuntime } from "../config/runtime.js";

let cached: { urls: string; provider: FailoverRpcProvider } | undefined;

/** One failover provider per configured RPC list; a reconfigured runtime gets a fresh one. */
export function nearRpcProvider(): FailoverRpcProvider {
  const urls = getRuntime().nearRpcUrls;
  const key = urls.join(",");
  if (cached?.urls !== key)
    cached = {
      urls: key,
      provider: new FailoverRpcProvider(
        urls.map((url) => new JsonRpcProvider({ url }, nearRpcRetryOptions)),
      ),
    };
  return cached.provider;
}
