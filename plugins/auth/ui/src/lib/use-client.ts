import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function useClientValue<T>(clientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(emptySubscribe, clientValue, () => serverValue);
}

const canMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!canMatchMedia()) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => (canMatchMedia() ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)", true);
}
