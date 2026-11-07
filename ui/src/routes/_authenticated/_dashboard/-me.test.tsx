// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { MePage } from "./me";

const identity = vi.hoisted(() => ({
  nearAccountId: null as string | null,
  avatarSrc: undefined as string | undefined,
  displayName: "Ada",
  handle: "ada@example.com",
  showHandle: true,
  initials: "A",
}));

vi.mock("@/components/layout/use-identity", () => ({ useIdentity: () => identity }));

vi.mock("@/app", () => ({
  pluginPath: (path: string) => path,
  useApiClient: () => ({
    getMyAttendance: async () => ({
      events: [
        {
          organizationId: "org-north",
          communityName: "North",
          eventId: "e1",
          eventName: "Builders Night",
          checkedInAt: "2026-10-10T18:30:00.000Z",
          startsAt: null,
        },
      ],
      unclassified: [],
      communities: [],
    }),
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (href, [key, value]) => href.replace(`$${key}`, value),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MePage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  identity.nearAccountId = null;
});

describe("the member's own page", () => {
  it("shows who they are, where to edit the profile, and their events across communities", async () => {
    show();
    expect(screen.getByTestId("me.header").textContent).toContain("Ada");
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByTestId("me.edit-profile").getAttribute("href")).toBe("/settings/profile");
    expect(screen.queryByTestId("me.public-profile")).toBeNull();

    const row = await screen.findByTestId("me.attendance-event");
    expect(row.textContent).toContain("Builders Night");
    expect(row.textContent).toContain("North");
  });

  it("links the public profile when the member has a NEAR account", () => {
    identity.nearAccountId = "builder.testnet";
    show();
    expect(screen.getByTestId("me.public-profile").getAttribute("href")).toBe("/builder.testnet");
  });
});
