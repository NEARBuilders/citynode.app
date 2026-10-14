import { describe, expect, it } from "vitest";
import { communityApplicationProgress } from "./-application-progress";

const recordedAt = "2026-09-10T00:00:00.000Z";

function progress(input: Partial<Parameters<typeof communityApplicationProgress>[0]>) {
  return communityApplicationProgress({
    reviewStatus: "approved",
    applyStatus: "applying",
    applySteps: {},
    applyTimedOut: false,
    appliedAt: null,
    ...input,
  })?.map((step) => [step.id, step.state]);
}

describe("community application progress", () => {
  it("has no setup steps before approval", () => {
    expect(progress({ reviewStatus: "pending", applyStatus: "not_started" })).toBeUndefined();
    expect(progress({ reviewStatus: "rejected", applyStatus: "not_started" })).toBeUndefined();
  });

  it("marks the first unrecorded step as the one that failed", () => {
    expect(
      progress({
        applyStatus: "failed",
        applySteps: { organization: { status: "completed", resourceId: "org", recordedAt } },
      }),
    ).toEqual([
      ["approval", "done"],
      ["organization", "done"],
      ["community", "failed"],
      ["publication", "upcoming"],
      ["complete", "upcoming"],
    ]);
  });

  it("separates a stalled run from one still in progress", () => {
    expect(progress({})?.[1]).toEqual(["organization", "current"]);
    expect(progress({ applyTimedOut: true })?.[1]).toEqual(["organization", "stalled"]);
  });

  it("shows an open DAO vote rather than a failure", () => {
    expect(
      progress({
        applyStatus: "failed",
        applySteps: {
          organization: { status: "completed", resourceId: "org", recordedAt },
          community: { status: "completed", resourceId: "node", recordedAt },
          publication: { status: "waiting", resourceId: "9", recordedAt },
        },
      })?.slice(3),
    ).toEqual([
      ["publication", "waiting"],
      ["complete", "upcoming"],
    ]);
  });

  it("treats applications completed before steps were recorded as done", () => {
    expect(progress({ applyStatus: "applied", appliedAt: recordedAt })).toEqual([
      ["approval", "done"],
      ["organization", "done"],
      ["community", "done"],
      ["publication", "done"],
      ["complete", "done"],
    ]);
  });
});
