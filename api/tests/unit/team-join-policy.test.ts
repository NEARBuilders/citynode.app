import { describe, expect, it } from "vitest";
import {
  closureReason,
  isJoinableTeam,
  memberDisplayName,
  recognizedAreas,
} from "@/team-join-policy";

const teams = new Map([
  ["ops", { id: "ops", name: "Operations", areas: ["node-operations"] }],
  ["event", { id: "event", name: "Hack Night", areas: [] }],
  ["legacy", { id: "legacy", name: "Legacy", areas: ["retired-area"] }],
]);
const memberIds = new Set(["member"]);

describe("team join policy", () => {
  it("keeps only recognized Feature Areas", () => {
    expect(recognizedAreas(["events", "retired-area", "finance"])).toEqual(["events", "finance"]);
  });

  it("treats teams without a recognized area as not joinable", () => {
    expect(isJoinableTeam(teams.get("ops"))).toBe(true);
    expect(isJoinableTeam(teams.get("event"))).toBe(false);
    expect(isJoinableTeam(teams.get("legacy"))).toBe(false);
    expect(isJoinableTeam(undefined)).toBe(false);
  });

  it("names why a pending request can no longer be approved", () => {
    const community = { memberIds, teams };
    expect(closureReason({ teamId: "ops", requesterUserId: "member" }, community)).toBeNull();
    expect(closureReason({ teamId: "ops", requesterUserId: "gone" }, community)).toBe(
      "requester_left",
    );
    expect(closureReason({ teamId: "missing", requesterUserId: "member" }, community)).toBe(
      "team_deleted",
    );
    expect(closureReason({ teamId: "legacy", requesterUserId: "member" }, community)).toBe(
      "team_not_joinable",
    );
  });

  it("never uses an email or a blank name as a display name", () => {
    expect(memberDisplayName("  Ada  ")).toBe("Ada");
    expect(memberDisplayName("ada@example.com")).toBeNull();
    expect(memberDisplayName("   ")).toBeNull();
    expect(memberDisplayName(null)).toBeNull();
  });
});
