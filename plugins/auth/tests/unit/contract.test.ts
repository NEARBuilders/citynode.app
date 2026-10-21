import { describe, expect, expectTypeOf, it } from "vitest";
import {
  contract,
  type InferOutput,
  type OnboardingRedeemReason,
  onboardingRedeemFailures,
} from "../../src/contract";

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
  organizationId: "org-123",
  organizationName: "Example Community",
  eventName: "Launch Night",
};

type RedeemOutput = InferOutput<"redeemOnboardingCode">;

describe("redeemOnboardingCode contract", () => {
  it("returns the organization the person joined", async () => {
    const result = await validateRedeemOutput(redeemed);
    expect(result.issues).toBeUndefined();
  });

  it("rejects a result without the organization name", async () => {
    const { organizationName: _omitted, ...withoutOrganization } = redeemed;
    const result = await validateRedeemOutput(withoutOrganization);
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  it("carries the joined flags", () => {
    expectTypeOf(redeemed).toMatchTypeOf<RedeemOutput>();
  });

  it("names each join failure reason on its error code", async () => {
    const reasons: OnboardingRedeemReason[] = [];
    for (const failure of Object.values(onboardingRedeemFailures)) {
      for (const reason of failure.data.shape.reason.options) {
        reasons.push(reason);
        const result = await failure.data["~standard"].validate({ reason });
        expect(result.issues, reason).toBeUndefined();
      }
    }
    expect(reasons.sort()).toEqual(
      [
        "code_expired",
        "code_not_found",
        "code_revoked",
        "code_used_up",
        "organization_full",
        "organization_not_active",
        "organization_not_found",
      ].sort(),
    );
  });
});
