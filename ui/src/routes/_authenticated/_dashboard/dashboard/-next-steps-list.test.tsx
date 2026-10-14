// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { getNextSteps } from "./-next-steps";
import { NextStepsList } from "./-next-steps-list";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    hash: _hash,
    ...props
  }: {
    children?: ReactNode;
    to?: string;
    hash?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("Home next steps for platform admins", () => {
  it("launches a community through the application, then the proposals queue", () => {
    const steps = getNextSteps({
      isAnonymous: false,
      hasPasskey: true,
      hasNear: true,
      hasRealEmail: true,
      organizationCount: 0,
      activeOrganizationName: null,
      community: null,
      canManageCommunity: false,
      isAdmin: true,
    });
    render(<NextStepsList steps={steps} primary={false} />);

    expect(screen.getByTestId("home-step-launch-node").getAttribute("href")).toBe("/apply");
    expect(screen.getByTestId("home-step-admin").getAttribute("href")).toBe("/admin/proposals");
  });
});
