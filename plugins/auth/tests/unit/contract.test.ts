import { describe, expect, expectTypeOf, it } from "vitest";
import {
  contract,
  type OnboardingRedeemFailureCode,
  type OnboardingRedeemReason,
  onboardingRedeemReasonSchema,
} from "../../src/contract";

const redeemErrorMap = contract.redeemOnboardingCode["~orpc"].errorMap;
const failureCodes = Object.keys(redeemErrorMap).filter(
  (code): code is OnboardingRedeemFailureCode => code !== "UNAUTHORIZED",
);

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
    expect(onboardingRedeemReasonSchema.options).toHaveLength(7);
    expectTypeOf<OnboardingRedeemReason>().not.toEqualTypeOf<string>();
  });

  it("sends each reason under exactly one error code", () => {
    for (const reason of onboardingRedeemReasonSchema.options) {
      const codes = failureCodes.filter(
        (code) => redeemErrorMap[code].data.safeParse({ reason }).success,
      );
      expect(codes, reason).toHaveLength(1);
    }
  });

  it.each(failureCodes)("rejects a reason the contract does not declare on %s", (code) => {
    expect(redeemErrorMap[code].data.safeParse({ reason: "not_a_reason" }).success).toBe(false);
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
