// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@/i18n/test-render";
import { MemberRow } from "./-member-card";

afterEach(cleanup);

describe("MemberRow", () => {
  it("shows a named member without an email or raw ID when the email is withheld", () => {
    render(
      <MemberRow
        canManage={false}
        member={{
          id: "member-1",
          userId: "user-1-opaque-id",
          role: "member",
          user: { id: "user-1-opaque-id", name: "Rui", email: null, image: null },
        }}
      />,
    );

    expect(screen.getByText("Rui")).toBeTruthy();
    expect(screen.queryByText("user-1-opaque-id")).toBeNull();
  });

  it("shows owners and admins the ID of a member without an email, so same-named members stay distinguishable", () => {
    render(
      <MemberRow
        canManage
        member={{
          id: "member-3",
          userId: "user-3-opaque-id",
          role: "member",
          user: { id: "user-3-opaque-id", name: "Passkey user", email: null, image: null },
        }}
      />,
    );

    expect(screen.getByText("user-3-opaque-id")).toBeTruthy();
  });

  it("shows a named member's real email under their name", () => {
    render(
      <MemberRow
        canManage
        member={{
          id: "member-2",
          userId: "user-2",
          role: "owner",
          user: { id: "user-2", name: "Olu", email: "olu@example.com", image: null },
        }}
      />,
    );

    expect(screen.getByText("olu@example.com")).toBeTruthy();
  });
});
