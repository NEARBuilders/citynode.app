// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToHash } from "./use-scroll-to-hash";

const harness = vi.hoisted(() => ({ hash: "" }));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { hash: string }) => string }) =>
    select({ hash: harness.hash }),
}));

function Section({ show }: { show: boolean }) {
  const ref = useScrollToHash("payouts");
  return show ? <div id="payouts" ref={ref} /> : null;
}

describe("useScrollToHash", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    harness.hash = "payouts";
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(cleanup);

  it("scrolls to the section once it appears after data loads", () => {
    const view = render(<Section show={false} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    view.rerender(<Section show />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("payouts"));
  });

  it("scrolls only once while the hash stays the same", () => {
    const view = render(<Section show />);
    view.rerender(<Section show />);
    view.rerender(<Section show={false} />);
    view.rerender(<Section show />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("ignores other hashes", () => {
    harness.hash = "updates";
    render(<Section show />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls again when a link targets the section after the hash left", () => {
    const view = render(<Section show />);
    harness.hash = "";
    view.rerender(<Section show />);
    harness.hash = "payouts";
    view.rerender(<Section show />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
