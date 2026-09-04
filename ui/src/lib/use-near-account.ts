import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { getNearAccountId, sessionQueryOptions, useAuthClient } from "./auth";

type NearState = {
  accountId: string | null;
  publicKey: string | null;
  networkId: string;
} | null;

export function useNearAccount(): string | null {
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const nearState = auth.$store.atoms.nearState;
  const state = useSyncExternalStore(
    nearState.subscribe,
    () => nearState.get(),
    () => null,
  );
  const user = session?.user as
    | {
        accounts?: Array<{ providerId?: unknown; accountId?: unknown; network?: unknown }>;
      }
    | undefined;
  return (state as NearState)?.accountId ?? getNearAccountId(user?.accounts ?? []);
}
