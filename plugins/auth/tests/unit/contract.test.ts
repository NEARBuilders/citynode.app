import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { contract, onboardingRedeemReasons } from "../../src/contract";

const redeemErrorMap = contract.redeemOnboardingCode["~orpc"].errorMap;

function reasonSchema(code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND") {
  const data = redeemErrorMap[code]?.data;
  expect(data).toBeDefined();
  return data as z.ZodType<{ reason: string }>;
}

function redeemOutputSchema() {
  const outputSchemas = contract.redeemOnboardingCode["~orpc"].outputSchemas;
  const schema = Array.isArray(outputSchemas) ? outputSchemas[0] : undefined;
  expect(schema).toBeDefined();
  if (!schema) {
    throw new Error("redeemOnboardingCode output schema is missing");
  }
  return schema as z.ZodType<{
    success: boolean;
    alreadyRedeemed: boolean;
    organizationName: string;
    eventName: string;
    organizationId: string;
  }>;
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

describe("redeemOnboardingCode contract output", () => {
  it("parses a result with organizationId and rejects one without it", () => {
    const output = redeemOutputSchema();
    const redeemed = {
      success: true,
      alreadyRedeemed: false,
      organizationName: "Chicago Builders",
      eventName: "Launch Night",
      organizationId: "org-1",
    };
    expect(output.parse(redeemed)).toEqual(redeemed);
    const { organizationId: _, ...withoutOrganizationId } = redeemed;
    expect(() => output.parse(withoutOrganizationId)).toThrow();
  });
});
