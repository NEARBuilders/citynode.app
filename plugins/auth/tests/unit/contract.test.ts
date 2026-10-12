import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { contract, onboardingRedeemReasons } from "../../src/contract";

const redeemErrorMap = contract.redeemOnboardingCode["~orpc"].errorMap;

const declaredReasons = [
  "organization_not_active",
  "organization_full",
  "code_revoked",
  "code_expired",
  "code_used_up",
  "code_not_found",
  "organization_not_found",
] as const;

function reasonSchema(code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND") {
  const data = redeemErrorMap[code]?.data;
  expect(data).toBeDefined();
  return data as z.ZodType<{ reason: string }>;
}

describe("redeemOnboardingCode contract errors", () => {
  it("declares exactly the seven join-failure reasons", () => {
    expect(onboardingRedeemReasons).toEqual(declaredReasons);
  });

  it.each([
    "FORBIDDEN",
    "BAD_REQUEST",
    "NOT_FOUND",
  ] as const)("accepts each declared reason on %s and rejects any other value", (code) => {
    const schema = reasonSchema(code);
    for (const reason of declaredReasons) {
      expect(schema.parse({ reason })).toEqual({ reason });
    }
    expect(() => schema.parse({ reason: "not_a_reason" })).toThrow();
  });
});
