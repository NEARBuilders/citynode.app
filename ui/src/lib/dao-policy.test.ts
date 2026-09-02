import { describe, expect, it } from "vitest";
import {
  buildTenantPublishConfig,
  isExplicitDaoMember,
  parsePolicyGroupMembers,
} from "./dao-policy";

describe("parsePolicyGroupMembers", () => {
  it("returns the union of all Group role members", () => {
    const policy = {
      roles: [
        { kind: "Everyone", name: "all" },
        { name: "council", kind: { Group: ["alice.near", "bob.near"] } },
        { name: "contributors", kind: { Group: ["bob.near", "carol.near"] } },
        { name: "broken", kind: { NotAGroup: true } },
        { name: "null-kind", kind: null },
      ],
    };
    expect(parsePolicyGroupMembers(policy)).toEqual(
      expect.arrayContaining(["alice.near", "bob.near", "carol.near"]),
    );
    expect(parsePolicyGroupMembers(policy)).toHaveLength(3);
  });

  it("returns an empty array for non-object or missing-roles inputs", () => {
    expect(parsePolicyGroupMembers(null)).toEqual([]);
    expect(parsePolicyGroupMembers(undefined)).toEqual([]);
    expect(parsePolicyGroupMembers({})).toEqual([]);
    expect(parsePolicyGroupMembers({ roles: "nope" })).toEqual([]);
    expect(parsePolicyGroupMembers(42)).toEqual([]);
  });
});

describe("isExplicitDaoMember", () => {
  it("returns true when the account is named in any Group role", () => {
    const policy = { roles: [{ name: "council", kind: { Group: ["alice.near"] } }] };
    expect(isExplicitDaoMember(policy, "alice.near")).toBe(true);
  });

  it("returns false when the account only appears in the Everyone role", () => {
    const policy = { roles: [{ kind: "Everyone", name: "all" }] };
    expect(isExplicitDaoMember(policy, "anyone.near")).toBe(false);
  });
});

describe("buildTenantPublishConfig", () => {
  it("always uses the connected DAO account as the FastKV namespace", () => {
    const config = buildTenantPublishConfig({
      daoAccountId: "genesis.dao.near",
      gatewayId: "citynode.app",
      baseAccount: "v1.citynode.near",
      hostname: "chicago.citynode.app",
      title: "Chicago",
    });
    expect(config).toEqual({
      extends: "bos://v1.citynode.near/citynode.app",
      account: "genesis.dao.near",
      domain: "chicago.citynode.app",
      title: "Chicago",
      description: "Chicago",
    });
  });

  it("threads the status flag through when present", () => {
    expect(
      buildTenantPublishConfig({
        daoAccountId: "x.near",
        gatewayId: "citynode.app",
        baseAccount: "v1.citynode.near",
        hostname: "x.citynode.app",
        title: "X",
        status: "suspended",
      }).status,
    ).toBe("suspended");
  });
});
