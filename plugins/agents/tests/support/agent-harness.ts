import { createHash } from "node:crypto";
import {
  configureNearAccessKeyVerifier,
  configureNearAccountReader,
  configureNearPolicyOwnerVerifier,
  configurePolicyStorageEstimator,
} from "@near-intents-agent-api/agents-core";
import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";
import { OutlayerError } from "@near-intents-agent-api/outlayer";
import { ownerNep413SigningDigest } from "@near-intents-agent-api/relayer/owner-message";

export const storageDeposit = "11900000000000000000000";

export function nep413Digest(input: { message: string; nonceHex: string; recipient: string }) {
  return ownerNep413SigningDigest({
    message: input.message,
    nonce: Buffer.from(input.nonceHex, "hex"),
    recipient: input.recipient,
  });
}

export type StubProvider = {
  client: OutlayerWalletClient;
  encryptedPolicies: string[];
  state: {
    submissions: number;
    registerCalls: number;
    policyStatus: "success" | "failed";
    custodyKeys: Map<string, string>;
    controllers: Map<string, string>;
    controller: string;
    nearAccountIdOverride: string | undefined;
    registerFailure: boolean;
  };
};

/**
 * Provider double with one token that has a defuse id and one that has none, per-wallet policy
 * reads, and mutation results keyed by submission order. Ported from the upstream test harness.
 */
export function stubProvider(): StubProvider {
  configurePolicyStorageEstimator(async () => "0");
  const state = {
    encryptedPolicies: [] as string[],
    submissions: 0,
    registerCalls: 0,
    policyStatus: "success" as "success" | "failed",
    registerFailure: false,
    controllers: new Map<string, string>(),
    custodyKeys: new Map<string, string>(),
    controller: "",
    nearAccountIdOverride: undefined as string | undefined,
  };
  const providerMutationResult = () => ({
    request_id: `req-${state.submissions}`,
    status: state.policyStatus,
    ...(state.policyStatus === "success"
      ? {
          tx_hash: `tx-${state.submissions}`,
          intent_hash: `intent-${state.submissions}`,
          settlement_tx_hash: `settlement-${state.submissions}`,
        }
      : {}),
  });
  const client = {
    network: "mainnet",
    contractId: "outlayer.near",
    async registerWallet() {
      state.registerCalls += 1;
      if (state.registerFailure) throw new Error("synthetic register failure");
      const apiKey = `wk_test_${state.registerCalls}`;
      const nearAccountId =
        state.nearAccountIdOverride ??
        createHash("sha256").update(`test-custody-wallet-${state.registerCalls}`).digest("hex");
      state.custodyKeys.set(nearAccountId, apiKey);
      return {
        api_key: apiKey,
        near_account_id: nearAccountId,
        wallet_id: `wallet-${apiKey.slice(8)}`,
      };
    },
    async address(_apiKey: string, chain = "near") {
      if (chain === "ethereum") return { address: `0x${"ab".repeat(20)}`, chain };
      return { address: `acct-${state.registerCalls}.near`, chain };
    },
    async balance() {
      return {
        account_id: "acct.near",
        balance: "5000000000000000000000000",
        source: "chain" as const,
      };
    },
    async confidentialBalance() {
      return { single: false as const, value: { account_id: "acct.near", balances: [] } };
    },
    async tokens() {
      return {
        tokens: [
          {
            id: "wrap.near",
            symbol: "wNEAR",
            chains: ["near"],
            decimals: 24,
            defuse_asset_id: "nep141:wrap.near",
          },
          { id: "usdt.tether-token.near", symbol: "USDT", chains: ["near"], decimals: 6 },
        ],
      };
    },
    async policy(apiKey: string) {
      const walletId = `wallet-${apiKey.slice(8)}`;
      const policies = state.encryptedPolicies.map(
        (encrypted) => JSON.parse(Buffer.from(encrypted, "base64").toString("utf8")) as object,
      );
      const last = policies.findLast(
        (policy) => (policy as { wallet_id?: string }).wallet_id === walletId,
      );
      return last ? { ...last, controller: state.controllers.get(apiKey) ?? state.controller } : {};
    },
    async encryptPolicy(_apiKey: string, _policy: unknown, _walletId: string) {
      const encrypted = Buffer.from(
        JSON.stringify({ ...(_policy as object), wallet_id: _walletId }),
      ).toString("base64");
      state.encryptedPolicies.push(encrypted);
      return { encrypted_base64: encrypted };
    },
    async signPolicy(apiKey: string, input: { caller: string }) {
      state.controller = input.caller;
      state.controllers.set(apiKey, input.caller);
      return { public_key_hex: "2".repeat(64), signature_hex: "3".repeat(128) };
    },
    invalidatePolicyCache() {
      return Promise.resolve({});
    },
    async walletExecution(_path: string, _key: string, body: { token?: string }) {
      if (body.token === "nep141:unlisted.near") throw new OutlayerError("policy_denied", 403);
      state.submissions++;
      return providerMutationResult();
    },
    async deleteWallet() {
      state.submissions += 1;
      return providerMutationResult();
    },
    async requestStatus(_apiKey: string, requestId: string) {
      return {
        ...providerMutationResult(),
        request_id: requestId,
      };
    },
    async walletRead() {
      return { checks: [] };
    },
    async walletQuote(path: string, _apiKey: string, body: Record<string, unknown>) {
      return {
        route: path,
        amount_out: "990000",
        min_amount_out: body.min_amount_out ?? null,
        fee_amount: "10000",
      };
    },
  } as unknown as OutlayerWalletClient;
  configureNearPolicyOwnerVerifier({
    async verify({ nearAccountId }) {
      const apiKey = state.custodyKeys.get(nearAccountId);
      return (apiKey && state.controllers.get(apiKey)) || state.controller || null;
    },
  });
  configureNearAccountReader({
    async exists() {
      return true;
    },
  });
  configureNearAccessKeyVerifier({ async verifyFullAccess() {} });
  return {
    client,
    encryptedPolicies: state.encryptedPolicies,
    state,
  };
}

/**
 * Owner policy sponsor double: relays the owner's signed delegate on the sponsor's key.
 * Ported from the upstream test harness; nothing reaches a network.
 */
export function stubOwnerSponsor(onFreeze?: (frozen: boolean) => void) {
  const calls: Array<{ freeze?: boolean }> = [];
  let transactionStatus: "pending" | "succeeded" | "failed" | "dropped" = "succeeded";
  const sponsor = {
    accountId: "sponsor.near",
    receiverId: "outlayer.near",
    gas: "100000000000000",
    storageDepositYocto: "100000000000000000000000",
    async prepare(input: {
      senderId: string;
      publicKey: string;
      actions: Array<Record<string, unknown>>;
    }) {
      return {
        ...input,
        receiverId: "outlayer.near",
        nonce: String(calls.length + 1),
        maxBlockHeight: "100",
      };
    },
    async blockHeight() {
      return 50n;
    },
    async status(
      _hash: string,
      _accountId?: string,
      witness?: { publicKey: string; nonce: bigint },
    ) {
      void witness;
      if (transactionStatus === "dropped") return "pending";
      return transactionStatus;
    },
    async assertBalance() {},
    async submit(
      input: { actions: Array<{ methodName: string }> },
      _signatureHex: string,
      beforeBroadcast: (
        hash: string,
        witness?: { publicKey: string; nonce: bigint },
      ) => Promise<void>,
      beforeSigning?: () => Promise<void>,
    ) {
      await beforeSigning?.();
      const method = input.actions.find(
        (action) => action.methodName !== "store_wallet_policy",
      )?.methodName;
      if (method === "freeze_wallet") onFreeze?.(true);
      if (method === "unfreeze_wallet") onFreeze?.(false);
      calls.push({
        freeze:
          method === "freeze_wallet" ? true : method === "unfreeze_wallet" ? false : undefined,
      });
      await beforeBroadcast(`tx-${calls.length}`, {
        publicKey: "ed25519:sponsor",
        nonce: BigInt(100 + calls.length),
      });
      return { transactionHash: `tx-${calls.length}`, finalExecutionStatus: "FINAL" };
    },
  };
  return {
    sponsor,
    calls,
    setStatus(next: typeof transactionStatus) {
      transactionStatus = next;
    },
  };
}

/**
 * Wallet sponsor double for passkey/EVM `0s` owners: storage funding is a separate transfer that
 * calls the API's journal before it "broadcasts", then the owner's signed request is relayed.
 * Ported from the upstream test harness.
 */
export function stubWalletSponsor() {
  let transactionStatus: "pending" | "succeeded" | "failed" | "dropped" = "succeeded";
  const fundings: Array<{ receiverId: string; amount: bigint; hash: string }> = [];
  const relays: string[] = [];
  const relaySigned = Object.assign(
    async (
      message: { signer_id: string },
      _proof: string,
      beforeBroadcast: (
        hash: string,
        witness?: { publicKey: string; nonce: bigint },
      ) => Promise<void>,
    ) => {
      const hash = `relay-${relays.length + 1}`;
      await beforeBroadcast(hash, {
        publicKey: "ed25519:sponsor",
        nonce: BigInt(500 + relays.length),
      });
      relays.push(message.signer_id);
      return {
        transactionHash: hash,
        finalExecutionStatus: "FINAL" as const,
        status: { SuccessValue: "" },
      };
    },
    {
      async status(
        _hash: string,
        _accountId?: string,
        witness?: { publicKey: string; nonce: bigint },
      ) {
        void witness;
        if (transactionStatus === "dropped") return "pending";
        return transactionStatus;
      },
      async assertBalance() {},
    },
  );
  const sponsor = {
    accountId: "sponsor.near",
    initialize: async () => "local-init",
    relaySigned,
    async fundPolicyStorage(
      receiverId: string,
      amount: bigint,
      journal: (hash: string, witness?: { publicKey: string; nonce: bigint }) => Promise<void>,
    ) {
      const hash = `funding-${fundings.length + 1}`;
      await journal(hash, { publicKey: "ed25519:sponsor", nonce: BigInt(900 + fundings.length) });
      fundings.push({ receiverId, amount, hash });
      return hash;
    },
  };
  return {
    sponsor,
    fundings,
    relays,
    setStatus(next: typeof transactionStatus) {
      transactionStatus = next;
    },
  };
}
