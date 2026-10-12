import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { contract, onboardingRedeemReasons } from "../../src/contract";

const redeemErrorMap = contract.redeemOnboardingCode["~orpc"].errorMap;

function reasonSchema(code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND") {
  const data = redeemErrorMap[code]?.data;
  expect(data).toBeDefined();
  return data as z.ZodType<{ reason: string }>;
}

describe("redeemOnboardingCode contract errors", () => {
  it.each([
    "FORBIDDEN",
    "BAD_REQUEST",
    "NOT_FOUND",
  ] as const)("accepts each declared reason on %s and rejects any other value", (code) => {
    const schema = reasonSchema(code);
    for (const reason of onboardingRedeemReasons) {
      expect(schema.parse({ reason })).toEqual({ reason });
    }
    expect(() => schema.parse({ reason: "not_a_reason" })).toThrow();
  });
});
