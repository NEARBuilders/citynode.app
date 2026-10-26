import { describe, expect, it } from "vitest";
import {
  canAccountApprove,
  canAccountPropose,
  proposalPermission,
  type SputnikPolicy,
  type SputnikRole,
} from "./sputnik-proposals";

const ONE_NEAR = 10n ** 24n;
const COUNCIL = "council-one.near";
const MEMBER = "member-one.near";
const OUTSIDER = "outsider.near";

function defaultPolicy(council: string[]): SputnikPolicy {
  return {
    roles: [
      { name: "all", kind: "Everyone", permissions: ["*:AddProposal"], vote_policy: {} },
      {
        name: "council",
        kind: { Group: council },
        permissions: [
          "*:AddProposal",
          "*:VoteApprove",
          "*:VoteReject",
          "*:VoteRemove",
          "*:Finalize",
        ],
        vote_policy: {},
      },
    ],
    default_vote_policy: { threshold: [1, 2] },
    proposal_bond: ONE_NEAR.toString(),
    proposal_period: "604800000000000",
  };
}

function policyWith(roles: SputnikRole[], proposalBond: unknown = "0"): SputnikPolicy {
  return {
    roles,
    default_vote_policy: { threshold: [1, 2] },
    proposal_bond: proposalBond as string,
    proposal_period: "604800000000000",
  };
}

const councilRole: SputnikRole = {
  name: "council",
  kind: { Group: [COUNCIL] },
  permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"],
};

/** A Node DAO's live mainnet policy (read with `get_policy`), with made-up account names. */
const nodeDaoPolicy: Record<string, unknown> = {
  roles: [
    {
      name: "Requestor",
      kind: {
        Group: [
          "requestor-a.near",
          "requestor-b.near",
          "requestor-c.near",
          "requestor-d.near",
          "requestor-e.near",
          "admin-a.near",
          "admin-b.near",
        ],
      },
      permissions: [
        "call:AddProposal",
        "transfer:VoteRemove",
        "call:VoteRemove",
        "transfer:AddProposal",
      ],
      vote_policy: {
        call: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
        transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
      },
    },
    {
      name: "Admin",
      kind: { Group: ["admin-a.near", "admin-b.near"] },
      permissions: [
        "remove_member_from_role:*",
        "set_vote_token:*",
        "upgrade_remote:*",
        "policy_update_parameters:*",
        "policy_add_or_update_role:*",
        "policy:*",
        "bounty_done:*",
        "config:*",
        "upgrade_self:*",
        "add_bounty:*",
        "factory_info_update:*",
        "add_member_to_role:*",
        "policy_remove_role:*",
        "policy_update_default_vote_policy:*",
      ],
      vote_policy: {
        call: { weight_kind: "RoleWeight", quorum: "0", threshold: "3" },
        policy: { weight_kind: "RoleWeight", quorum: "0", threshold: "3" },
      },
    },
    {
      name: "Approver",
      kind: {
        Group: [
          "requestor-c.near",
          "requestor-a.near",
          "requestor-e.near",
          "admin-b.near",
          "requestor-b.near",
          "requestor-d.near",
        ],
      },
      permissions: [
        "call:RemoveProposal",
        "call:Finalize",
        "transfer:VoteReject",
        "transfer:Finalize",
        "call:VoteApprove",
        "transfer:VoteApprove",
        "transfer:RemoveProposal",
        "call:VoteReject",
      ],
      vote_policy: {
        call: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
        transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
      },
    },
  ],
  default_vote_policy: {
    weight_kind: "RoleWeight",
    quorum: "0",
    threshold: [1, 2],
  },
  proposal_bond: "0",
  proposal_period: "604800000000000",
  bounty_bond: "0",
  bounty_forgiveness_period: "604800000000000",
};

describe("proposalPermission", () => {
  describe("default Sputnik policy", () => {
    const policy = defaultPolicy([COUNCIL]);

    it("lets anyone add any kind through Everyone's *:AddProposal, with the 1 NEAR bond", () => {
      expect(proposalPermission(policy, OUTSIDER, "call")).toEqual({
        canPropose: true,
        reason: "allowed",
        bondYocto: ONE_NEAR,
      });
      expect(proposalPermission(policy, OUTSIDER, "policy").canPropose).toBe(true);
      expect(proposalPermission(policy, COUNCIL, "transfer").canPropose).toBe(true);
    });
  });

  describe("members group (decision A: Members)", () => {
    const policy = policyWith([
      { name: "all", kind: "Everyone", permissions: ["*:Finalize"] },
      councilRole,
      {
        name: "members",
        kind: { Group: [MEMBER] },
        permissions: ["call:AddProposal", "vote:AddProposal"],
      },
    ]);

    it("allows a group member to add the kinds the group grants", () => {
      expect(proposalPermission(policy, MEMBER, "call")).toEqual({
        canPropose: true,
        reason: "allowed",
        bondYocto: 0n,
      });
      expect(proposalPermission(policy, MEMBER, "vote").canPropose).toBe(true);
    });

    it("refuses a kind the group does not grant", () => {
      expect(proposalPermission(policy, MEMBER, "transfer")).toEqual({
        canPropose: false,
        reason: "no-permission",
        bondYocto: 0n,
      });
    });

    it("refuses an account outside every group when Everyone lacks AddProposal", () => {
      expect(proposalPermission(policy, OUTSIDER, "call").reason).toBe("no-permission");
    });
  });

  describe("Everyone role (decision A: Everyone)", () => {
    it("allows any account when Everyone has AddProposal for the kind", () => {
      const policy = policyWith([
        { name: "all", kind: "Everyone", permissions: ["vote:AddProposal"] },
        councilRole,
      ]);
      expect(proposalPermission(policy, OUTSIDER, "vote").canPropose).toBe(true);
      expect(proposalPermission(policy, OUTSIDER, "call").reason).toBe("no-permission");
    });

    it("refuses when Everyone has other permissions but not AddProposal", () => {
      const policy = policyWith([
        { name: "all", kind: "Everyone", permissions: ["call:VoteApprove", "*:Finalize"] },
        councilRole,
      ]);
      expect(proposalPermission(policy, OUTSIDER, "call").reason).toBe("no-permission");
      expect(proposalPermission(policy, COUNCIL, "call").canPropose).toBe(true);
    });
  });

  describe("permission forms", () => {
    it.each([
      "call:AddProposal",
      "call:*",
      "*:AddProposal",
      "*:*",
    ])("%s authorizes adding a call proposal", (permission) => {
      const policy = policyWith([{ name: "all", kind: "Everyone", permissions: [permission] }]);
      expect(proposalPermission(policy, OUTSIDER, "call").canPropose).toBe(true);
    });

    it.each([
      ["transfer:AddProposal", "call"],
      ["transfer:*", "call"],
      ["call:VoteApprove", "call"],
      ["*:VoteApprove", "call"],
      ["policy:*", "policy_add_or_update_role"],
      ["policy:AddProposal", "policy_update_parameters"],
      ["call:AddProposal", "vote"],
    ] as const)("%s does not authorize adding a %s proposal", (permission, kind) => {
      const policy = policyWith([{ name: "all", kind: "Everyone", permissions: [permission] }]);
      expect(proposalPermission(policy, OUTSIDER, kind).reason).toBe("no-permission");
    });
  });

  describe("token-weighted Member role", () => {
    const policy = policyWith([
      { name: "holders", kind: { Member: "100" }, permissions: ["call:AddProposal"] },
    ]);

    it("allows an account whose delegated weight meets the threshold", () => {
      expect(proposalPermission(policy, MEMBER, "call", 100n).canPropose).toBe(true);
      expect(proposalPermission(policy, MEMBER, "call", 150n).canPropose).toBe(true);
    });

    it("refuses below the threshold or when the weight is unknown", () => {
      expect(proposalPermission(policy, MEMBER, "call", 99n).reason).toBe("no-permission");
      expect(proposalPermission(policy, MEMBER, "call").reason).toBe("no-permission");
    });

    it("treats a zero threshold as open to anyone", () => {
      const open = policyWith([
        { name: "holders", kind: { Member: "0" }, permissions: ["call:AddProposal"] },
      ]);
      expect(proposalPermission(open, OUTSIDER, "call").canPropose).toBe(true);
    });
  });

  describe("live Node DAO policy", () => {
    it("lets a Requestor add call and transfer proposals with a zero bond", () => {
      expect(proposalPermission(nodeDaoPolicy, "requestor-a.near", "call")).toEqual({
        canPropose: true,
        reason: "allowed",
        bondYocto: 0n,
      });
      expect(proposalPermission(nodeDaoPolicy, "requestor-a.near", "transfer").canPropose).toBe(
        true,
      );
    });

    it("keeps policy proposals with the Admin group", () => {
      expect(proposalPermission(nodeDaoPolicy, "requestor-a.near", "policy").reason).toBe(
        "no-permission",
      );
      expect(proposalPermission(nodeDaoPolicy, "admin-a.near", "policy").canPropose).toBe(true);
    });

    it("refuses an account outside every group, so members need the policy change", () => {
      for (const kind of ["call", "transfer", "vote"] as const) {
        expect(proposalPermission(nodeDaoPolicy, MEMBER, kind).reason).toBe("no-permission");
      }
    });

    it("leaves the existing call-proposal helpers' answers unchanged", () => {
      const policy = nodeDaoPolicy as unknown as SputnikPolicy;
      expect(canAccountPropose(policy, "requestor-a.near")).toBe(true);
      expect(canAccountPropose(policy, MEMBER)).toBe(false);
      expect(canAccountApprove(policy, "requestor-a.near")).toBe(true);
      expect(canAccountApprove(policy, "admin-a.near")).toBe(false);
    });
  });

  describe("bond", () => {
    const everyone: SputnikRole[] = [
      { name: "all", kind: "Everyone", permissions: ["call:AddProposal"] },
    ];

    it("returns a zero bond as zero", () => {
      expect(proposalPermission(policyWith(everyone, "0"), MEMBER, "call").bondYocto).toBe(0n);
    });

    it("returns a positive bond in yoctoNEAR", () => {
      expect(
        proposalPermission(policyWith(everyone, "100000000000000000000000"), MEMBER, "call"),
      ).toEqual({ canPropose: true, reason: "allowed", bondYocto: 10n ** 23n });
    });

    it.each([
      ["absent", undefined],
      ["empty", ""],
      ["decimal", "0.1"],
      ["negative", "-1"],
      ["numeric", 0],
      ["null", null],
    ])("disallows submission when the bond is %s, never reading it as zero", (_label, bond) => {
      const { proposal_bond: _bond, ...withoutBond } = policyWith(everyone);
      const policy = bond === undefined ? withoutBond : { ...withoutBond, proposal_bond: bond };
      expect(proposalPermission(policy, MEMBER, "call")).toEqual({
        canPropose: false,
        reason: "bond-unavailable",
        bondYocto: null,
      });
    });
  });

  describe("missing or unreadable policy", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["not an object", "policy"],
      ["without roles", { proposal_bond: "0" }],
      ["with non-array roles", { roles: "council", proposal_bond: "0" }],
      ["with a malformed role", { roles: [null], proposal_bond: "0" }],
    ])("can't propose when the policy is %s", (_label, policy) => {
      expect(proposalPermission(policy, MEMBER, "call")).toEqual({
        canPropose: false,
        reason: "no-policy",
        bondYocto: null,
      });
    });

    it("ignores a role whose permissions are not a list", () => {
      const policy = {
        roles: [{ name: "all", kind: "Everyone", permissions: "*:*" }],
        proposal_bond: "0",
      };
      expect(proposalPermission(policy, MEMBER, "call").reason).toBe("no-permission");
    });
  });

  it("can't propose without an account", () => {
    expect(proposalPermission(defaultPolicy([COUNCIL]), null, "call")).toEqual({
      canPropose: false,
      reason: "no-account",
      bondYocto: ONE_NEAR,
    });
  });
});
