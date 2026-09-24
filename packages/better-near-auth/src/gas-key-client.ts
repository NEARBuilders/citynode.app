import { atom } from "nanostores";
import type { GasKeyState, NearNetwork } from "./store.js";

export { deleteSessionGasKey, loadSessionGasKey, saveSessionGasKey } from "./gas-key-store.js";

export type GasKeyScope = {
  enabled: boolean;
  receiverId?: string;
  methodNames?: string[];
  numNonces?: number;
  fundAmount?: string;
  fundAmountYocto?: string;
  topUpThreshold?: string;
  topUpThresholdYocto?: string;
  maxFundPerUser?: string;
};

export type { GasKeyState } from "./store.js";

export const gasKeyState = atom<GasKeyState>(null);

export function isGasKeyWallet(manifestFeatures: unknown): boolean {
  return (
    typeof manifestFeatures === "object" &&
    manifestFeatures !== null &&
    (manifestFeatures as { gasKeys?: unknown }).gasKeys === true
  );
}

const laneCounters = new Map<string, number>();

export function nextLane(networkId: NearNetwork, accountId: string, numNonces: number): number {
  const key = `${networkId}:${accountId}`;
  const current = laneCounters.get(key) ?? 0;
  const lane = numNonces > 0 ? current % numNonces : 0;
  laneCounters.set(key, current + 1);
  return lane;
}
