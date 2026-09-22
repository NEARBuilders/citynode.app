import { useNearAccountId } from "better-near-auth/react";

import { useAuthClient } from "everything-dev/ui/auth";

export function useNearAccount(): string | null {
  const auth = useAuthClient();
  return useNearAccountId(auth);
}
