import {
  Account,
  type Action,
  baseEncode,
  type KeyPairString,
  type PublicKey,
  type SignedTransaction,
} from "near-api-js";
import type { NonceWitness } from "./finality.js";
import { createNearRpcProvider } from "./near-rpc.js";
import { assertSponsorBalance, type SponsorCost, transactionCost } from "./sponsor-balance.js";

/**
 * One `Account` instance per operational key, process-wide.
 *
 * `near-api-js` keeps its access-key nonce cache inside `Account` (`NonceManager`), keyed only
 * by public key. Constructing a fresh `Account` per call therefore makes two concurrent
 * transactions read the same chain nonce, and the second one is rejected as `InvalidNonce`.
 * Reusing the instance lets that in-process cache serialize nonce allocation.
 *
 * This is necessary but not sufficient across replicas: `apps/server` additionally wraps each
 * broadcast in a Postgres advisory lock so only one process prepares a transaction per key.
 */
const accounts = new Map<string, Account>();

function accountKey(input: { rpcUrls: string[]; accountId: string; privateKey: KeyPairString }) {
  return `${input.rpcUrls.join(",")}\u0000${input.accountId}\u0000${input.privateKey}`;
}

export function operationalAccount(input: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
}): Account {
  const key = accountKey(input);
  const existing = accounts.get(key);
  if (existing) return existing;
  const provider = createNearRpcProvider(input.rpcUrls);
  const account = new Account(input.accountId, provider, input.privateKey);
  accounts.set(key, account);
  return account;
}

/**
 * Highest nonce this process signed per sponsor key.
 *
 * `near-api-js` reads the next nonce at `optimistic` finality, and a load-balanced RPC can answer
 * from a node a few blocks behind. Back-to-back transactions from one key (wallet init, storage
 * funding, relay) would then reuse a nonce, and the node silently drops the duplicate. Nonce gaps
 * are valid, so never signing at or below the floor costs nothing.
 */
const nonceFloors = new Map<string, bigint>();

function floorKey(accountId: string, publicKey: string) {
  return `${accountId}\u0000${publicKey}`;
}

/** The chain's candidate nonce, raised above every nonce this process already signed. */
export function nextOperationalNonce(accountId: string, publicKey: string, candidate: bigint) {
  const floor = nonceFloors.get(floorKey(accountId, publicKey));
  return floor !== undefined && candidate <= floor ? floor + 1n : candidate;
}

export function recordOperationalNonce(accountId: string, witness: NonceWitness) {
  const key = floorKey(accountId, witness.publicKey);
  const floor = nonceFloors.get(key);
  if (floor === undefined || witness.nonce > floor) nonceFloors.set(key, witness.nonce);
}

/** One signed operational transaction, with the nonce it consumes and what it costs the sponsor. */
export type PreparedOperational<T> = {
  hash: string;
  send: () => Promise<T>;
  witness?: NonceWitness;
  cost?: SponsorCost;
};

/** Signs `actions` with the account's key at a nonce above this process's floor. */
export async function signOperationalTransaction(
  account: Account,
  input: { receiverId: string; actions: Action[] },
): Promise<{
  hash: string;
  signedTransaction: SignedTransaction;
  witness: NonceWitness;
  cost: SponsorCost;
}> {
  const signer = account.getSigner();
  if (!signer) throw new Error("operational_signer_missing");
  const publicKey = await signer.getPublicKey();
  const transaction = await account.createTransaction({ ...input, publicKey });
  transaction.nonce = nextOperationalNonce(
    account.accountId,
    publicKey.toString(),
    transaction.nonce,
  );
  const { txHash, signedTransaction } = await signer.signTransaction(transaction);
  return {
    hash: baseEncode(txHash),
    signedTransaction,
    witness: { publicKey: publicKey.toString(), nonce: transaction.nonce },
    cost: transactionCost(input.actions),
  };
}

/**
 * Prepares, persists and broadcasts exactly one operational transaction. An error after
 * `beforeBroadcast` can be ambiguous across RPC endpoints, and a consumed nonce can belong to this
 * very transaction, so no error ever authorizes a replacement at a fresh nonce.
 */
export async function sendOperationalTransaction<T>(input: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
  prepare: (account: Account) => Promise<PreparedOperational<T>>;
  beforeBroadcast: (hash: string, witness?: NonceWitness) => Promise<void>;
}): Promise<{ hash: string; result: T }> {
  // Other replicas sign with the same key under the shared sponsor lock, so this process's cached
  // nonce can be behind the chain. Every send starts from the chain's access-key nonce instead of
  // discovering the drift through a superseded transaction.
  await resetOperationalNonce(input);
  const account = operationalAccount(input);
  const { hash, send, witness, cost } = await input.prepare(account);
  if (cost) await assertSponsorBalance(account.provider, input.accountId, cost);
  if (witness) recordOperationalNonce(input.accountId, witness);
  await input.beforeBroadcast(hash, witness);
  return { hash, result: await send() };
}

/**
 * Forget the cached access-key nonce for one key. `nonceManager` is private in the type
 * definitions but present at runtime; when the shape is unavailable this degrades to a no-op and
 * the caller still fails closed.
 */
export async function resetOperationalNonce(input: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
}): Promise<void> {
  const account = accounts.get(accountKey(input));
  if (!account) return;
  const manager = (
    account as unknown as {
      nonceManager?: { invalidate(publicKey: PublicKey): Promise<void> };
    }
  ).nonceManager;
  const signer = account.getSigner();
  if (!manager || !signer) return;
  await manager.invalidate(await signer.getPublicKey());
}
