// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { NeedsActionRow } from "./-platform-status";

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({}),
  Link: ({
    children,
    to,
    search,
  }: {
    children?: ReactNode;
    to?: string;
    search?: Record<string, string | undefined>;
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    return <a href={query ? `${to}?${query}` : to}>{children}</a>;
  },
}));

vi.mock("@/app", () => ({
  getActiveRuntime: () => undefined,
  useApiClient: () => ({}),
}));

afterEach(cleanup);

describe("NeedsActionRow", () => {
  it("opens the whole community's missing event reports when no monthly report is owed", () => {
    render(
      <NeedsActionRow
        item={{
          kind: "reportsMissing",
          chase: {
            organizationId: "org-manila",
            nodeId: "node-manila",
            name: "Manila",
            slug: "manila",
            months: [],
            overdueEvents: 2,
          },
        }}
      />,
    );
    expect(screen.getByText("Remind Manila to report").closest("a")?.getAttribute("href")).toBe(
      "/admin/events?community=org-manila&report=missing",
    );
  });
});
