import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { callViewFunction } from "@/lib/near-rpc";

const balanceSchema = z.string().regex(/^\d+$/).transform(BigInt);
const accountCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const feeSchema = z
  .object({
    numerator: accountCountSchema,
    denominator: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine(({ numerator, denominator }) => numerator <= denominator);

interface PoolOptions {
  accountId: string;
  network?: string;
  protocol?: string;
}

export const stakePoolQueryKeys = {
  all: ["stake-pool"] as const,
  pool: (accountId: string, network: string) =>
    [...stakePoolQueryKeys.all, accountId, network] as const,
  stats: (accountId: string, network: string) =>
    [...stakePoolQueryKeys.pool(accountId, network), "stats"] as const,
  topHolders: (accountId: string, network: string, limit?: number) => {
    const key = [...stakePoolQueryKeys.pool(accountId, network), "top-holders"] as const;
    return limit === undefined || limit === 50 ? key : ([...key, limit] as const);
  },
  account: (accountId: string, network: string, stakerAccountId: string) =>
    [...stakePoolQueryKeys.pool(accountId, network), "account", stakerAccountId] as const,
};

export interface StakePoolValidator {
  accountId: string;
  network?: string | null;
  protocol?: string | null;
  isDefault: boolean;
}

export function resolveTeamStakeTarget(input: {
  daoAccountId?: string | null;
  tenantAccountId?: string | null;
  tenantOwnerKind?: string | null;
  validators: readonly StakePoolValidator[];
}) {
  const teamAccountId =
    input.daoAccountId?.trim() ||
    (input.tenantOwnerKind === "dao" ? input.tenantAccountId?.trim() : "") ||
    "";
  if (!teamAccountId) return null;
  const pool = input.validators.find((validator) => validator.isDefault) ?? input.validators[0];
  if (!pool?.accountId) return null;
  return {
    teamAccountId,
    poolAccountId: pool.accountId,
    network: pool.network || "mainnet",
    protocol: pool.protocol || "near",
  };
}

function canReadPool({ accountId, network = "mainnet", protocol = "near" }: PoolOptions) {
  return !!accountId && protocol === "near" && (network === "mainnet" || network === "testnet");
}

export function stakePoolStatsQueryOptions(options: PoolOptions) {
  const { accountId, network = "mainnet" } = options;
  return queryOptions({
    queryKey: stakePoolQueryKeys.stats(accountId, network),
    enabled: canReadPool(options),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const [total, fee, count] = await Promise.all([
        callViewFunction(accountId, "get_total_staked_balance", {}, network),
        callViewFunction(accountId, "get_reward_fee_fraction", {}, network),
        callViewFunction(accountId, "get_number_of_accounts", {}, network),
      ]);
      const { numerator, denominator } = feeSchema.parse(fee);
      return {
        totalStaked: balanceSchema.parse(total),
        feeNumerator: numerator,
        feeDenominator: denominator,
        stakerCount: accountCountSchema.parse(count),
      };
    },
  });
}

export type TeamStakeTarget = NonNullable<ReturnType<typeof resolveTeamStakeTarget>>;

export interface StakePoolAccountView {
  accountId: string;
  stakedBalance: bigint;
  unstakedBalance: bigint;
  canWithdraw: boolean;
}

export function stakePoolAccountQueryOptions(options: {
  poolAccountId: string;
  stakerAccountId: string;
  network?: string;
  protocol?: string;
}) {
  const { poolAccountId, stakerAccountId, network = "mainnet" } = options;
  return queryOptions({
    queryKey: stakePoolQueryKeys.account(poolAccountId, network, stakerAccountId),
    enabled: canReadPool({ ...options, accountId: poolAccountId }) && !!stakerAccountId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const raw = await callViewFunction(
        poolAccountId,
        "get_account",
        { account_id: stakerAccountId },
        network,
      );
      const account = z
        .object({
          account_id: z.string().min(1),
          staked_balance: balanceSchema,
          unstaked_balance: balanceSchema,
          can_withdraw: z.boolean(),
        })
        .parse(raw);
      const view: StakePoolAccountView = {
        accountId: account.account_id,
        stakedBalance: account.staked_balance,
        unstakedBalance: account.unstaked_balance,
        canWithdraw: account.can_withdraw,
      };
      return view;
    },
  });
}

export function stakePoolTopHoldersQueryOptions(options: PoolOptions & { limit?: number }) {
  const { accountId, network = "mainnet" } = options;
  const requestedLimit = options.limit ?? 50;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
    : 50;
  return queryOptions({
    queryKey: stakePoolQueryKeys.topHolders(accountId, network, limit),
    enabled: canReadPool(options),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const raw = await callViewFunction(
        accountId,
        "get_accounts",
        { from_index: 0, limit },
        network,
      );
      const accounts = z
        .array(
          z.object({
            account_id: z.string().min(1),
            staked_balance: balanceSchema,
          }),
        )
        .parse(raw);
      return accounts
        .slice(0, limit)
        .map((account) => ({
          accountId: account.account_id,
          stakedBalance: account.staked_balance,
        }))
        .sort((a, b) =>
          a.stakedBalance > b.stakedBalance
            ? -1
            : a.stakedBalance < b.stakedBalance
              ? 1
              : a.accountId.localeCompare(b.accountId),
        );
    },
  });
}

export function invalidateStakePoolQueries(
  queryClient: QueryClient,
  accountId: string,
  network: string,
) {
  return queryClient.invalidateQueries({ queryKey: stakePoolQueryKeys.pool(accountId, network) });
}

export function formatNearBalance(balance: bigint) {
  const rounded = (balance + 50_000_000_000_000_000_000n) / 100_000_000_000_000_000_000n;
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
    rounded / 10_000n,
  );
  const fraction = (rounded % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} NEAR`;
}

export function formatPoolFee(numerator: number, denominator: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 4 }).format(
    numerator / denominator,
  );
}
