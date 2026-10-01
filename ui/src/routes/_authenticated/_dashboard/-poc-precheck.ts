import { AppActionError } from "@/i18n/error-message";
import type { DaoPlan, PoolAccountView } from "./-poc-chain";
import {
  fetchAccountBalance,
  fetchLockupState,
  fetchVenearAccount,
  formatNear,
  getNear,
  isPositive,
  lockupAvailableYocto,
  remainingToFund,
  remainingToStake,
  yoctoArg,
} from "./-poc-chain";
import type { PocLogger } from "./-poc-log-message";
import type { SignerKind, StationState, StepState } from "./-poc-stations";

export interface PrecheckContext {
  locale?: string;
  pool: string;
  teamLockup: string;
  endowmentLockup: string;
  accountFor: (signer: SignerKind) => string | null;
  log: PocLogger;
  fetchPublishedNow: () => Promise<unknown>;
  fetchTeamPoolAccount: () => Promise<PoolAccountView | null | undefined>;
}

/**
 * Re-checks a step against fresh chain state right before signing. Returns
 * the plan to sign (possibly narrowed to the remaining amount), or null when
 * the step is already done and must be skipped instead of re-signed.
 */
export function createPrecheckPlan(ctx: PrecheckContext) {
  const {
    locale = "en",
    pool,
    teamLockup,
    endowmentLockup,
    accountFor,
    log,
    fetchPublishedNow,
    fetchTeamPoolAccount,
  } = ctx;
  return async (station: StationState, step: StepState): Promise<DaoPlan | null> => {
    const plan = step.plan;
    if (!plan) return null;
    if (plan.kind === "transfer") {
      if (step.id !== "fund-lockup") return plan;
      if (!endowmentLockup) {
        throw new AppActionError("poc.endowmentResolving");
      }
      const state = await fetchLockupState(endowmentLockup).catch(() => null);
      if (!state) return plan;
      const remaining = remainingToFund(plan.amountYocto, state);
      if (remaining <= 0n) {
        log({ messageId: "poc.lockupFunded" });
        return null;
      }
      if (remaining < BigInt(plan.amountYocto)) {
        log({
          messageId: "poc.topUp",
          values: { amount: formatNear(remaining.toString(), locale) ?? "" },
        });
      }
      return { kind: "transfer", receiverId: plan.receiverId, amountYocto: remaining.toString() };
    }
    if (plan.kind !== "call") return plan;
    const signerLockup = station.def.signer === "endowment" ? endowmentLockup : teamLockup;
    switch (step.id) {
      case "publish": {
        const live = await fetchPublishedNow();
        if (live) {
          log({ messageId: "poc.configLive" });
          return null;
        }
        return plan;
      }
      case "register":
      case "register-endowment": {
        const account = accountFor(station.def.signer) ?? "";
        const ve = await fetchVenearAccount(account).catch(() => null);
        if (ve) {
          log({ messageId: "poc.registered" });
          return null;
        }
        return plan;
      }
      case "deploy-lockup":
      case "deploy-lockup-endowment": {
        if (!signerLockup) {
          throw new AppActionError("poc.lockupResolving");
        }
        const state = await fetchLockupState(signerLockup).catch(() => null);
        if (state) {
          log({ messageId: "poc.lockupDeployed" });
          return null;
        }
        return plan;
      }
      case "lock":
      case "lock-endowment": {
        if (!signerLockup) {
          throw new AppActionError("poc.lockupResolving");
        }
        const state = await fetchLockupState(signerLockup).catch(() => null);
        if (!state) throw new AppActionError("poc.deployFirst");
        if (isPositive(state.liquid)) return plan;
        if (isPositive(state.locked)) {
          log({ messageId: "poc.locked" });
          return null;
        }
        throw new AppActionError("poc.fundFirst");
      }
      case "stake": {
        const want = yoctoArg(plan.attachedDeposit);
        if (want <= 0n) return plan;
        const current = await fetchTeamPoolAccount();
        if (!current) return plan;
        const staked = yoctoArg(current.staked_balance);
        const remaining = want > staked ? want - staked : 0n;
        if (remaining <= 0n) {
          log({ messageId: "poc.teamStaked" });
          return null;
        }
        return { ...plan, attachedDeposit: remaining.toString() };
      }
      case "select-pool": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (state?.stakingPool && state.stakingPool === String(plan.args.staking_pool_account_id)) {
          log({ messageId: "poc.poolSelected" });
          return null;
        }
        return plan;
      }
      case "unselect-old-pool": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log({ messageId: "poc.noPool" });
          return null;
        }
        if (state.stakingPool === pool) {
          log({ messageId: "poc.poolMatches" });
          return null;
        }
        if (isPositive(state.knownDeposited)) {
          throw new AppActionError("poc.unstakeFirst");
        }
        return plan;
      }
      case "stake-endowment": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const want = yoctoArg(plan.args.amount);
        if (want <= 0n) return plan;
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state) return plan;
        const remaining = remainingToStake(want.toString(), state);
        if (remaining <= 0n) {
          log({ messageId: "poc.lockupStaked" });
          return null;
        }
        const balance = await fetchAccountBalance(endowmentLockup).catch(() => null);
        if (balance) {
          const available = lockupAvailableYocto(balance);
          if (remaining > available) {
            throw new AppActionError("poc.maxStake", {
              amount: formatNear(available.toString(), locale) ?? "",
            });
          }
        }
        return { ...plan, args: { ...plan.args, amount: remaining.toString() } };
      }
      case "set-delegations": {
        const entries = plan.args.entries as { account_id: string; bps: number }[] | undefined;
        if (!entries) return plan;
        const ve = await fetchVenearAccount(accountFor("endowment") ?? "").catch(() => null);
        if (
          ve &&
          ve.account.delegations.length === entries.length &&
          entries.every((entry) =>
            ve.account.delegations.some(
              (delegation) =>
                delegation.account_id === entry.account_id && delegation.bps === entry.bps,
            ),
          )
        ) {
          log({ messageId: "poc.delegated" });
          return null;
        }
        return plan;
      }
      case "unstake-all": {
        const current = await fetchTeamPoolAccount();
        if (!current || !isPositive(current.staked_balance)) {
          log({ messageId: "poc.teamNothingStaked" });
          return null;
        }
        return plan;
      }
      case "withdraw": {
        const current = await fetchTeamPoolAccount();
        if (!current || !isPositive(current.unstaked_balance)) {
          log({ messageId: "poc.teamNothingWithdraw" });
          return null;
        }
        if (!current.can_withdraw) {
          throw new AppActionError("poc.epochLocked");
        }
        return plan;
      }
      case "unstake-endowment": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (state && !isPositive(state.knownDeposited)) {
          log({ messageId: "poc.nothingStaked" });
          return null;
        }
        return plan;
      }
      case "withdraw-endowment": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log({ messageId: "poc.noPool" });
          return null;
        }
        const staked = await getNear()
          .view<PoolAccountView>(state.stakingPool, "get_account", { account_id: endowmentLockup })
          .catch(() => null);
        if (!staked || !isPositive(staked.unstaked_balance)) {
          log({ messageId: "poc.nothingWithdraw" });
          return null;
        }
        if (!staked.can_withdraw) {
          throw new AppActionError("poc.epochLocked");
        }
        return plan;
      }
      case "unselect-pool": {
        if (!endowmentLockup) {
          throw new AppActionError("poc.endowmentResolving");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log({ messageId: "poc.poolReleased" });
          return null;
        }
        if (isPositive(state.knownDeposited)) {
          throw new AppActionError("poc.unstakeFirst");
        }
        return plan;
      }
      case "clear-delegations": {
        const ve = await fetchVenearAccount(accountFor("endowment") ?? "").catch(() => null);
        if (ve && ve.account.delegations.length === 0) {
          log({ messageId: "poc.noDelegations" });
          return null;
        }
        return plan;
      }
      default:
        return plan;
    }
  };
}
