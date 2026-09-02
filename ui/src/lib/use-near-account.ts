import { useSyncExternalStore } from "react";

import { useAuthClient } from "./auth";

type NearState = {
  accountId: string | null;
  publicKey: string | null;
  networkId: string;
} | null;

export function useNearAccount(): string | null {
  const auth = useAuthClient();
  const nearState = auth.$store.atoms.nearState;
  const state = useSyncExternalStore(
    nearState.subscribe,
    () => nearState.get(),
    () => null,
  );
  return (state as NearState)?.accountId ?? null;
}
