import { describe, expect, it } from "vitest";
import {
  activeTeamBlocksEvents,
  type CommunityPageViewer,
  communityPageActions,
} from "./community-page-actions";

const visitor: CommunityPageViewer = {
  signedIn: false,
  platformAdmin: false,
  inCommunity: false,
  orgRole: null,
  teamAreas: [],
  rolePending: false,
};

describe("active team blocking the events page", () => {
  it("blocks a finance or stake team and lets an events team through", () => {
    expect(activeTeamBlocksEvents(["finance"])).toBe(true);
    expect(activeTeamBlocksEvents(["stake"])).toBe(true);
    expect(activeTeamBlocksEvents(["events"])).toBe(false);
    expect(activeTeamBlocksEvents(["node-operations"])).toBe(false);
    expect(activeTeamBlocksEvents(null)).toBe(false);
    expect(activeTeamBlocksEvents(undefined)).toBe(false);
  });
});

describe("community page actions by role", () => {
  it("shows a signed-out visitor the join hint and no one's admin actions", () => {
    expect(communityPageActions(visitor)).toEqual({
      joinHint: true,
      openCommunity: false,
      openEvents: false,
      openSetup: false,
      openAdmin: false,
    });
  });

  it("treats a signed-in person who is not in this community as a visitor", () => {
    expect(communityPageActions({ ...visitor, signedIn: true })).toEqual(
      communityPageActions(visitor),
    );
  });

  it("lets a member open the community and hides setup, events management and admin rows", () => {
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        orgRole: "member",
      }),
    ).toEqual({
      joinHint: false,
      openCommunity: true,
      openEvents: false,
      openSetup: false,
      openAdmin: false,
    });
  });

  it("lets an organizer open events and not the setup steps", () => {
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        orgRole: "member",
        teamAreas: ["events"],
      }),
    ).toEqual({
      joinHint: false,
      openCommunity: false,
      openEvents: true,
      openSetup: false,
      openAdmin: false,
    });
  });

  it("lets a leader open setup, and keeps the admin list for a platform admin who leads", () => {
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        orgRole: "owner",
      }).openSetup,
    ).toBe(true);
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        orgRole: "member,admin",
      }),
    ).toMatchObject({ openSetup: false, openCommunity: true, openAdmin: false });
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        orgRole: "owner",
        platformAdmin: true,
      }),
    ).toMatchObject({ openSetup: true, openAdmin: true, joinHint: false, openCommunity: false });
  });

  it("shows a platform admin the admin list, including when they only belong as a member", () => {
    expect(communityPageActions({ ...visitor, signedIn: true, platformAdmin: true })).toEqual({
      joinHint: false,
      openCommunity: false,
      openEvents: false,
      openSetup: false,
      openAdmin: true,
    });
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        platformAdmin: true,
        inCommunity: true,
        orgRole: "member",
      }),
    ).toMatchObject({ openAdmin: true, openCommunity: true, openSetup: false, joinHint: false });
  });

  it("shows nothing while the viewer's role is still loading", () => {
    expect(
      communityPageActions({
        ...visitor,
        signedIn: true,
        inCommunity: true,
        rolePending: true,
      }),
    ).toEqual({
      joinHint: false,
      openCommunity: false,
      openEvents: false,
      openSetup: false,
      openAdmin: false,
    });
  });
});
