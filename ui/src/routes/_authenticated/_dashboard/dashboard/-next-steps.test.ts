import { describe, expect, it } from "vitest";
import {
  getNextSteps,
  getNodeSetupSteps,
  type NextStepsState,
  type NodeSetupState,
} from "./-next-steps";

const base: NextStepsState = {
  isAnonymous: false,
  hasPasskey: true,
  hasNear: false,
  organizationCount: 1,
  activeOrganizationName: "Harbor",
  community: null,
  canManageCommunity: false,
  canOrganizeEvents: false,
  isAdmin: false,
};

const harbor = { name: "Harbor City", tenantId: "t1" };

const ids = (state: Partial<NextStepsState>) =>
  getNextSteps({ ...base, ...state }).map((step) => step.id);

describe("home next steps", () => {
  it("asks an anonymous user without a sign-in method to save the account first", () => {
    expect(ids({ isAnonymous: true, hasPasskey: false })[0]).toBe("save-account");
    expect(ids({ isAnonymous: true, hasPasskey: false, hasNear: true })).not.toContain(
      "save-account",
    );
  });

  it("sends a user without organizations straight to starting a community", () => {
    expect(ids({ organizationCount: 0, activeOrganizationName: null })).toEqual([
      "start-community",
      "stake",
      "explore",
    ]);
  });

  it("asks a member of several organizations to pick an active one", () => {
    expect(ids({ organizationCount: 2, activeOrganizationName: null })[0]).toBe("choose-org");
  });

  it("offers Start a community when the active organization has no community", () => {
    expect(ids({})).toEqual(["start-community", "stake", "explore"]);
  });

  it("opens a plain member's community first, naming only what members can open", () => {
    const steps = getNextSteps({ ...base, community: harbor });
    expect(steps.map((step) => step.id)).toEqual(["open-community", "stake"]);
    expect(steps[0]?.title).toBe("Open Harbor City");
    expect(steps[0]?.description).toBe("See its Overview and Proposals.");
  });

  it("keeps a member who joined without a real email on the same steps", () => {
    expect(ids({ community: harbor, hasNear: false, hasPasskey: true })).toEqual([
      "open-community",
      "stake",
    ]);
  });

  it("keeps the owner steps for owners, with payouts", () => {
    const steps = getNextSteps({ ...base, community: harbor, canManageCommunity: true });
    expect(steps.map((step) => step.id)).toEqual(["open-community", "payouts", "stake"]);
    expect(steps[0]?.title).toBe("Open My community");
    expect(steps[0]?.description).toBe("Harbor City: events, onboarding, proposals.");
  });

  it("keeps the organizer steps for events-team organizers", () => {
    const steps = getNextSteps({ ...base, community: harbor, canOrganizeEvents: true });
    expect(steps.map((step) => step.id)).toEqual(["open-community", "stake"]);
    expect(steps[0]?.title).toBe("Open My community");
  });

  it("keeps the current steps for platform admins in a community", () => {
    const steps = getNextSteps({ ...base, community: harbor, isAdmin: true });
    expect(steps.map((step) => step.id)).toEqual([
      "launch-node",
      "admin",
      "open-community",
      "stake",
    ]);
    expect(steps[2]?.title).toBe("Open My community");
  });

  it("leads admins with launching a node and the review queue", () => {
    expect(ids({ organizationCount: 0, activeOrganizationName: null, isAdmin: true })).toEqual([
      "launch-node",
      "admin",
      "stake",
      "explore",
    ]);
  });
});

describe("node setup checklist", () => {
  const profile: NonNullable<NodeSetupState["profile"]> = {
    published: true,
    latitude: 6.5,
    summary: "Builders in Lagos",
    channels: [{}],
  };

  it("starts with every step open for a fresh node", () => {
    expect(
      getNodeSetupSteps({ profile: null, eventCount: 0, onboardingCodeCount: 0 }).map(
        (step) => step.done,
      ),
    ).toEqual([false, false, false, false]);
  });

  it("only counts the map pin once the profile is published with coordinates", () => {
    const map = (overrides: Partial<typeof profile>) =>
      getNodeSetupSteps({
        profile: { ...profile, ...overrides },
        eventCount: 0,
        onboardingCodeCount: 0,
      })[0];
    expect(map({}).done).toBe(true);
    expect(map({ published: false }).done).toBe(false);
    expect(map({ latitude: null }).done).toBe(false);
  });

  it("needs both a description and a social link for the profile step", () => {
    const step = (overrides: Partial<typeof profile>) =>
      getNodeSetupSteps({
        profile: { ...profile, ...overrides },
        eventCount: 0,
        onboardingCodeCount: 0,
      })[1];
    expect(step({}).done).toBe(true);
    expect(step({ summary: "  " }).done).toBe(false);
    expect(step({ channels: [] }).done).toBe(false);
  });

  it("ticks events and QR codes off from activity", () => {
    const steps = getNodeSetupSteps({ profile, eventCount: 2, onboardingCodeCount: 1 });
    expect(steps.every((step) => step.done)).toBe(true);
  });
});
