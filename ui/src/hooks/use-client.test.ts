// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useMediaQuery } from "./use-client";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener(_event: string, listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_event: string, listener: () => void) {
      listeners.delete(listener);
    },
    dispatch(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
  window.matchMedia = () => media as unknown as MediaQueryList;
  return media;
}

describe("useMediaQuery", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("tracks the current viewport and later changes", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(true);

    act(() => {
      media.dispatch(false);
    });
    expect(result.current).toBe(false);
  });
});
