import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createMemberSessionWallet,
  createMemberSigningController,
  type MemberSigningController,
  type MemberSigningState,
  type MemberWalletExecutor,
} from "./member-wallet";

export interface UseMemberSigningResult<T> {
  state: MemberSigningState<T>;
  submit: MemberSigningController<T>["submit"];
  reset(): void;
}

export function useMemberSigning<T>(
  sessionAccountId: string | null,
  executor?: MemberWalletExecutor,
): UseMemberSigningResult<T> {
  const { wallet, controller } = useMemo(() => {
    const wallet = createMemberSessionWallet({ sessionAccountId, executor });
    return { wallet, controller: createMemberSigningController<T>(wallet) };
  }, [sessionAccountId, executor]);

  const previousAccount = useRef(sessionAccountId);
  useEffect(() => {
    const previous = previousAccount.current;
    previousAccount.current = sessionAccountId;
    if (previous !== null && previous !== sessionAccountId) void wallet.disconnect();
    return () => controller.reset();
  }, [sessionAccountId, wallet, controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return { state, submit: controller.submit, reset: controller.reset };
}
