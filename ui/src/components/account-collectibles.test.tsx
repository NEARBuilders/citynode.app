// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AccountCollectibles } from "./account-collectibles";

const harness = vi.hoisted(() => ({
  calls: [] as string[],
  getAccountCollectibles: (async () => ({ enabled: true, collectibles: [] })) as (input: {
    accountId: string;
  }) => Promise<unknown>,
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    getAccountCollectibles: (input: { accountId: string }) => {
      harness.calls.push(input.accountId);
      return harness.getAccountCollectibles(input);
    },
  }),
}));

function show(accountId = "lin.testnet") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountCollectibles accountId={accountId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  harness.calls.length = 0;
  harness.getAccountCollectibles = async () => ({ enabled: true, collectibles: [] });
});

describe("AccountCollectibles", () => {
  it("lists the account's badges in the order the API returns, each linking to ShardDog", async () => {
    harness.getAccountCollectibles = async () => ({
      enabled: true,
      collectibles: [
        {
          organizationId: "org-north",
          communityName: "North city",
          kind: "event",
          eventId: "event-2",
          eventTitle: "Hack day",
          awardedAt: "2026-11-20T10:00:00.000Z",
          viewUrl: "https://shard.dog/view/hack",
        },
        {
          organizationId: "org-north",
          communityName: "North city",
          kind: "membership",
          eventId: null,
          eventTitle: null,
          awardedAt: "2026-11-10T10:00:00.000Z",
          viewUrl: "https://shard.dog/view/member",
        },
      ],
    });
    show("lin.testnet");

    const list = await screen.findByTestId("account.collectibles-list");
    expect(harness.calls).toEqual(["lin.testnet"]);
    expect(list.children).toHaveLength(2);
    expect(list.children[0]?.textContent).toContain("Hack day");
    expect(list.children[1]?.textContent).toContain("Membership ShardDog");
    expect(list.textContent).toContain("North city");
    expect(
      screen.getAllByTestId("account.collectibles-view").map((link) => link.getAttribute("href")),
    ).toEqual(["https://shard.dog/view/hack", "https://shard.dog/view/member"]);
    for (const link of screen.getAllByTestId("account.collectibles-view")) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("shows a short empty state when the account has no badges", async () => {
    show();
    expect((await screen.findByTestId("account.collectibles-empty")).textContent).toBe(
      "No City Node collectibles yet.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing while ShardDog collectibles are switched off", async () => {
    harness.getAccountCollectibles = async () => ({ enabled: false, collectibles: [] });
    show();
    await waitFor(() => expect(harness.calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("account.collectibles")).toBeNull());
  });

  it("shows an error with a retry that reloads the list", async () => {
    let fail = true;
    harness.getAccountCollectibles = async () => {
      if (fail) throw new Error("down");
      return { enabled: true, collectibles: [] };
    };
    show();
    await screen.findByTestId("account.collectibles-error");
    fail = false;
    fireEvent.click(screen.getByTestId("account.collectibles-retry"));
    expect(await screen.findByTestId("account.collectibles-empty")).toBeTruthy();
  });
});
