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

async function validateRedeemOutput(value: unknown) {
  const schemas = contract.redeemOnboardingCode["~orpc"].outputSchemas ?? [];
  if (schemas.length === 0) throw new Error("redeemOnboardingCode declares no output schema");
  const results = await Promise.all(schemas.map((schema) => schema["~standard"].validate(value)));
  const issues = results.flatMap((result) => result.issues ?? []);
  return { issues: issues.length > 0 ? issues : undefined };
}

const redeemed = {
  success: true,
  alreadyRedeemed: false,
  organizationId: "org-1",
  organizationName: "Example Community",
  eventName: "Launch Night",
};

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

describe("redeemOnboardingCode contract", () => {
  it("returns the organization the person joined", async () => {
    const result = await validateRedeemOutput(redeemed);
    expect(result.issues).toBeUndefined();
  });

  it("rejects a result without the organization", async () => {
    const { organizationId: _omitted, ...withoutOrganization } = redeemed;
    const result = await validateRedeemOutput(withoutOrganization);
    expect(result.issues?.length).toBeGreaterThan(0);
  });
});
