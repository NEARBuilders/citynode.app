// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "@/components";
import { TenantDeployPhase } from "./-tenant-deploy-phase";
import { TenantOrganizationGate } from "./-tenant-organization-gate";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@/components/connect-dao", () => ({
  ConnectDao: () => <div data-testid="connect-dao" />,
}));

afterEach(cleanup);

const createSteps = (publishState: Step["state"]): Step[] => [
  { id: "create", label: "Create site, community and domain", state: "success", blocking: true },
  { id: "publish", label: "Publish config as DAO", state: publishState, blocking: false },
];

const deployProps = {
  verifyState: "idle" as const,
  verifyMessage: null,
  hostname: "chicago.citynode.app",
  daoAccountId: "dao.sputnik-dao.near",
  createdTenantId: "tenant-1",
  tenantSlug: "chicago",
  publishPending: false,
  allDone: false,
  onRecheck: vi.fn(),
  onSubmitPublish: vi.fn(),
  onResetPublish: vi.fn(),
};

describe("tenant wizard UI seams", () => {
  it("derives the organization slug and submits the prerequisite gate", () => {
    const onOrgNameChange = vi.fn();
    const onOrgSlugChange = vi.fn();
    const onSubmit = vi.fn();
    const orgSlugManuallyEdited = { current: false };

    render(
      <TenantOrganizationGate
        orgName=""
        orgSlug=""
        orgSlugManuallyEdited={orgSlugManuallyEdited}
        isPending={false}
        onOrgNameChange={onOrgNameChange}
        onOrgSlugChange={onOrgSlugChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Chicago City Node" },
    });
    fireEvent.change(screen.getByLabelText("Organization slug"), { target: { value: "chicago" } });
    fireEvent.submit(screen.getByTestId("admin-tenant-org-gate"));

    expect(onOrgNameChange).toHaveBeenCalledWith("Chicago City Node");
    expect(onOrgSlugChange).toHaveBeenLastCalledWith("chicago");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("forwards publish and retry controls for each deploy step state", () => {
    const { rerender } = render(
      <TenantDeployPhase {...deployProps} steps={createSteps("pending")} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish settings" }));
    expect(deployProps.onSubmitPublish).toHaveBeenCalledOnce();

    rerender(<TenantDeployPhase {...deployProps} steps={createSteps("failed")} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry publish" }));
    expect(deployProps.onResetPublish).toHaveBeenCalledOnce();

    rerender(
      <TenantDeployPhase
        {...deployProps}
        steps={createSteps("success")}
        verifyState="verified"
        verifyMessage="published"
        allDone
      />,
    );
    expect(screen.getByText("Tenant deployed at")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open community settings/ })).toBeTruthy();
  });
});
