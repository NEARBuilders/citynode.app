import {
  assertSponsorBalance,
  observeSponsorBalance,
  type SponsorBalanceObservation,
} from "@near-intents-agent-api/relayer";
import type { Provider } from "near-api-js";
import { logger } from "../shared/logger.js";
import { recordCounter } from "../shared/metrics.js";

/** At most one low-balance warning per interval; every sponsored write reads the balance. */
const warnIntervalMs = 60_000;

let latest: (SponsorBalanceObservation & { observedAt: string }) | undefined;
let lastWarnedAt = 0;

/**
 * Exports every sponsor balance read and warns while spendable balance is below `warnYocto`.
 * Transactions the sponsor cannot pay for are already refused before broadcast; this is the
 * operator's signal to top up before that happens.
 */
export function watchSponsorBalance(warnYocto: bigint) {
  observeSponsorBalance((observation) => {
    latest = { ...observation, observedAt: new Date().toISOString() };
    if (observation.availableYocto >= warnYocto) return;
    recordCounter("sponsor_balance_low");
    if (Date.now() - lastWarnedAt < warnIntervalMs) return;
    lastWarnedAt = Date.now();
    logger.warn("sponsor_balance_low", {
      sponsor_account_id: observation.accountId,
      available_yocto: observation.availableYocto.toString(),
      warn_yocto: warnYocto.toString(),
    });
  });
}

/** Startup read so `/metrics` and the warning reflect the balance before the first write. */
export async function readSponsorBalance(
  provider: Pick<Provider, "viewAccount" | "viewBlock">,
  accountId: string,
) {
  // Observation only: an empty or unreachable sponsor must not stop the API from starting.
  await assertSponsorBalance(provider, accountId, { depositYocto: 0n, gas: 0n }).catch(
    () => undefined,
  );
}

export function sponsorBalanceMetrics() {
  if (!latest) return undefined;
  return {
    account_id: latest.accountId,
    available_yocto: latest.availableYocto.toString(),
    last_required_yocto: latest.requiredYocto.toString(),
    observed_at: latest.observedAt,
  };
}
