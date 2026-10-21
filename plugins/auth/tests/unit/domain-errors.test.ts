import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import {
  CodeExpired,
  CodeLimitReached,
  CodeNotFound,
  CodeRevoked,
  OrgFull,
  OrgRequiresApproval,
  RedeemOrgMissing,
  toTransportError,
} from "../../src/services/domain-errors";

describe("toTransportError onboarding redeem reasons", () => {
  it.each([
    [new OrgRequiresApproval({ message: "pending" }), "FORBIDDEN", "organization_not_active"],
    [new OrgFull({ message: "full" }), "FORBIDDEN", "organization_full"],
    [new CodeRevoked({ message: "revoked" }), "FORBIDDEN", "code_revoked"],
    [new CodeLimitReached({ message: "limit" }), "FORBIDDEN", "code_used_up"],
    [new CodeExpired({ message: "expired" }), "BAD_REQUEST", "code_expired"],
    [new RedeemOrgMissing({ message: "missing" }), "BAD_REQUEST", "organization_not_found"],
    [new CodeNotFound({ message: "gone" }), "NOT_FOUND", "code_not_found"],
  ] as const)("%s carries %s / %s", (error, code, reason) => {
    const transport = toTransportError(error);
    expect(transport).toBeInstanceOf(ORPCError);
    expect(transport.code).toBe(code);
    expect(transport.data).toMatchObject({ reason });
  });
});
