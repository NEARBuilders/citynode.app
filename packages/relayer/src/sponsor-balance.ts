import type { Action, Provider } from "near-api-js";
import { RelayError } from "./errors.js";

/** Protocol storage staking price, yoctoNEAR per byte of account state. */
const storagePricePerByte = 10n ** 19n;
/** Receipt-creation and signature fees are small next to prepaid gas; 0.001 NEAR covers them. */
const feeMarginYocto = 10n ** 21n;
/** Used only when no endpoint reports the gas price: twice the current mainnet price. */
const fallbackGasPrice = 2n * 10n ** 8n;
/**
 * Prepaid gas is charged up front at the receipt gas price, ten times the block price (mainnet
 * protocol 86: block 1e8, receipts 1e9), and the unused part is refunded after execution. A
 * sponsor that holds enough for gas at the block price is still rejected by the chain, after the
 * RPC answered `NONE` as accepted.
 */
const receiptGasPriceMultiplier = 10n;

/** What one sponsored transaction can take from the sponsor: attached value and prepaid gas. */
export type SponsorCost = { depositYocto: bigint; gas: bigint };

export type SponsorBalanceObservation = {
  accountId: string;
  availableYocto: bigint;
  requiredYocto: bigint;
};

let observer: ((observation: SponsorBalanceObservation) => void) | undefined;

/** Receives every balance read, so the server can export it and warn before it runs out. */
export function observeSponsorBalance(next: typeof observer) {
  observer = next;
}

/**
 * Value and prepaid gas the signer pays. The relayer of a signed delegate pays its inner actions'
 * deposits as well as their gas: the chain charges them to the outer transaction's signer and
 * refunds them to the delegate's sender only if the inner actions fail.
 */
export function transactionCost(actions: readonly Action[]): SponsorCost {
  let depositYocto = 0n;
  let gas = 0n;
  for (const action of [
    ...actions,
    ...actions.flatMap((action) => action.signedDelegate?.delegateAction.actions ?? []),
  ]) {
    if (action.transfer) depositYocto += action.transfer.deposit;
    if (action.functionCall) {
      depositYocto += action.functionCall.deposit;
      gas += action.functionCall.gas;
    }
  }
  return { depositYocto, gas };
}

export function addCosts(...costs: SponsorCost[]): SponsorCost {
  return costs.reduce(
    (total, cost) => ({
      depositYocto: total.depositYocto + cost.depositYocto,
      gas: total.gas + cost.gas,
    }),
    { depositYocto: 0n, gas: 0n },
  );
}

type BalanceProvider = Pick<Provider, "viewAccount" | "viewBlock">;

/** The final block header carries the gas price; some endpoints fail the `gas_price` method. */
async function gasPrice(provider: BalanceProvider): Promise<bigint> {
  try {
    const block = await provider.viewBlock({ finality: "final" });
    const price = BigInt(String(block.header.gas_price));
    return price > 0n ? price : fallbackGasPrice;
  } catch {
    return fallbackGasPrice;
  }
}

/**
 * Refuses a sponsored transaction the sponsor cannot pay for, before anything is broadcast.
 *
 * Every public RPC answers `send_tx` with `wait_until: NONE` as accepted even when the chain will
 * reject the transaction, so an underfunded sponsor otherwise shows up only as a hash that never
 * appears and a finality timeout. Storage staking is locked and cannot pay for gas.
 */
export async function assertSponsorBalance(
  provider: BalanceProvider,
  accountId: string,
  cost: SponsorCost,
): Promise<void> {
  const [account, price] = await Promise.all([
    provider.viewAccount({ accountId, blockQuery: { finality: "final" } }),
    gasPrice(provider),
  ]);
  const availableYocto =
    BigInt(account.amount) - BigInt(account.storage_usage) * storagePricePerByte;
  const requiredYocto =
    cost.depositYocto + cost.gas * price * receiptGasPriceMultiplier + feeMarginYocto;
  observer?.({ accountId, availableYocto, requiredYocto });
  if (availableYocto < requiredYocto) throw new RelayError("sponsor_balance_insufficient");
}
