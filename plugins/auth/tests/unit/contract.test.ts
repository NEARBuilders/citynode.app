import { describe, expect, it } from "vitest";
import { contract } from "../../src/contract";

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
