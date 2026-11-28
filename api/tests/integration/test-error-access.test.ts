import { afterAll, describe, expect, it } from "vitest";
import { authedContext, getPluginClient, teardown } from "../setup";

afterAll(teardown);

describe("testError", () => {
  it("refuses anonymous callers", async () => {
    const anonymous = await getPluginClient();
    await expect(anonymous.testError({ kind: "internal" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses signed-in callers who are not platform admins", async () => {
    const member = await getPluginClient(authedContext("test-error-member"));
    await expect(member.testError({ kind: "not_found" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws the requested error for a platform admin", async () => {
    const admin = await getPluginClient(authedContext("test-error-admin", "admin"));
    await expect(admin.testError({ kind: "not_found" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin.testError({ kind: "conflict" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
