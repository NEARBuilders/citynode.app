// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvitationCard } from "./-invitation-card";
import { InviteMemberForm } from "./-invite-member-form";

const teams = [
  { id: "team-fin", name: "Finance" },
  { id: "team-ops", name: "Node Operator" },
];

function renderForm() {
  const onInvite = vi.fn().mockResolvedValue(undefined);
  render(<InviteMemberForm teams={teams} isPending={false} onInvite={onInvite} />);
  return { onInvite };
}

afterEach(cleanup);

describe("InviteMemberForm team targeting", () => {
  it("offers the organization's teams with no team selected by default", () => {
    renderForm();
    const picker = screen.getByTestId("invite-team-select") as HTMLSelectElement;

    expect(picker.value).toBe("");
    expect(Array.from(picker.options).map((option) => option.textContent)).toEqual([
      "No team",
      "Finance",
      "Node Operator",
    ]);
  });

  it("sends an invitation without a team", async () => {
    const { onInvite } = renderForm();

    fireEvent.change(screen.getByTestId("invite-identifier-input"), {
      target: { value: "hire@example.com" },
    });
    fireEvent.click(screen.getByTestId("invite-submit-button"));

    await waitFor(() =>
      expect(onInvite).toHaveBeenCalledWith({ email: "hire@example.com", role: "member" }),
    );
  });

  it("sends an invitation targeting the chosen team and role, then resets", async () => {
    const { onInvite } = renderForm();
    const input = screen.getByTestId("invite-identifier-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByTestId("invite-role-select"), { target: { value: "admin" } });
    fireEvent.change(screen.getByTestId("invite-team-select"), { target: { value: "team-ops" } });
    fireEvent.click(screen.getByTestId("invite-submit-button"));

    await waitFor(() =>
      expect(onInvite).toHaveBeenCalledWith({
        email: "ops@example.com",
        role: "admin",
        teamId: "team-ops",
      }),
    );
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps the input when sending fails", async () => {
    const onInvite = vi.fn().mockRejectedValue(new Error("nope"));
    render(<InviteMemberForm teams={teams} isPending={false} onInvite={onInvite} />);
    const input = screen.getByTestId("invite-identifier-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "retry@example.com" } });
    fireEvent.click(screen.getByTestId("invite-submit-button"));

    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(input.value).toBe("retry@example.com");
  });
});

describe("InvitationCard team targeting", () => {
  it("shows the targeted team when present", () => {
    render(
      <InvitationCard
        invitation={{
          id: "inv-1",
          email: "hire@example.com",
          role: "member",
          status: "pending",
          expiresAt: "2026-12-01T00:00:00.000Z",
        }}
        teamName="Finance"
      />,
    );

    expect(screen.getByTestId("invitation-team-inv-1").textContent).toContain("Finance");
  });
});
