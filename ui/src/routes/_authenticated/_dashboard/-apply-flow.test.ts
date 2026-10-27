import { describe, expect, it } from "vitest";
import { applicationInProgress, resolveApplySteps } from "./-apply-flow";

const none = { near: false, dao: false };
const all = { near: true, dao: true };

describe("apply stepper", () => {
  it("opens the first unfinished prerequisite", () => {
    const steps = resolveApplySteps(none, null);
    expect(steps.current).toBe("near");
    expect(steps.position).toBe(1);
    expect(steps.status("dao")).toBe("upcoming");
  });

  it("unlocks details once every prerequisite is done", () => {
    const steps = resolveApplySteps(all, null);
    expect(steps.current).toBe("details");
    expect(steps.status("dao")).toBe("complete");
  });

  it("reopens a completed step on request", () => {
    const steps = resolveApplySteps(all, "dao");
    expect(steps.current).toBe("dao");
    expect(steps.status("details")).toBe("upcoming");
  });

  it("ignores a reopen request for a step that is not complete", () => {
    expect(resolveApplySteps(none, "dao").current).toBe("near");
    expect(resolveApplySteps(all, "details").current).toBe("details");
  });

  it("skips ahead past prerequisites completed out of order", () => {
    const steps = resolveApplySteps({ near: false, dao: true }, null);
    expect(steps.current).toBe("near");
    expect(steps.status("dao")).toBe("complete");
  });
});

describe("application in progress", () => {
  it.each([
    ["pending", "not_started", true],
    ["approved", "not_started", true],
    ["approved", "applying", true],
    ["approved", "failed", true],
    ["rejected", "not_started", true],
    ["approved", "applied", false],
    ["removed", "not_started", false],
  ] as const)("treats %s/%s as in progress: %s", (reviewStatus, applyStatus, expected) => {
    expect(applicationInProgress({ reviewStatus, applyStatus })).toBe(expected);
  });
});
