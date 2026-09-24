import type { GasKeyState } from "better-near-auth/react";
import { useGasKeyState } from "better-near-auth/react";
import { useCallback, useEffect } from "react";
import { useAuthClient } from "@/app";

export function hasFundedGasKey(state: GasKeyState): boolean {
  return !!(state?.balance && /^\d+$/.test(state.balance) && BigInt(state.balance) > 0n);
}

export function useSessionGasKey(): {
  state: GasKeyState;
  isReady: boolean;
  refresh: () => Promise<GasKeyState>;
} {
  const auth = useAuthClient();
  const state = useGasKeyState(auth);

  const refresh = useCallback(async () => {
    try {
      return await auth.near.refreshGasKeyInfo();
    } catch {
      return null;
    }
  }, [auth]);

  const publicKey = state?.publicKey;
  useEffect(() => {
    if (!publicKey) return;
    void refresh();
    void auth.near.ensureGasKeyFunded();
  }, [auth, publicKey, refresh]);

  const isReady = hasFundedGasKey(state);
  return { state, isReady, refresh };
}
