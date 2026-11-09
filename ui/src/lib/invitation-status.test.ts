import { describe, expect, it } from "vitest";
import { invitationStatus, isOpenInvitation } from "./invitation-status";

const now = Date.parse("2026-11-09T12:00:00.000Z");

describe("invitation status", () => {
  it("treats a pending invitation past its expiry as expired", () => {
    const expired = { status: "pending", expiresAt: "2026-11-08T12:00:00.000Z" };
    expect(invitationStatus(expired, now)).toBe("expired");
    expect(isOpenInvitation(expired, now)).toBe(false);
  });

  it("keeps an unexpired pending invitation open", () => {
    const open = { status: "pending", expiresAt: new Date("2026-11-10T12:00:00.000Z") };
    expect(invitationStatus(open, now)).toBe("pending");
    expect(isOpenInvitation(open, now)).toBe(true);
  });

  it("reports settled invitations as they are", () => {
    for (const status of ["accepted", "rejected", "canceled"]) {
      expect(invitationStatus({ status, expiresAt: "2026-11-08T12:00:00.000Z" }, now)).toBe(status);
    }
  });
});
