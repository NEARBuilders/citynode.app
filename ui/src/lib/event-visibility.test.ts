import { describe, expect, it } from "vitest";
import { eventVisibilityCases } from "../../../api/tests/fixtures/event-visibility-cases";
import {
  eventVisibility,
  isWaitingImport,
  saveConfirmation,
  type VisibilityActivity,
} from "./event-visibility";

const now = Date.parse("2026-10-01T12:00:00Z");
const event: VisibilityActivity = {
  kind: "event",
  status: "published",
  publishedAt: "2026-09-30T12:00:00Z",
  startsAt: "2026-10-05T18:00:00Z",
  endsAt: "2026-10-05T20:00:00Z",
};
const luma = { available: true, hidden: true };
const visible = { communityPublic: true, now };

describe("eventVisibility", () => {
  it("is live only when the event and community are public and the publish time has passed", () => {
    expect(eventVisibility(event, visible)).toBe("live");
    expect(eventVisibility(event, { communityPublic: false, now })).toBe("published");
    expect(eventVisibility({ ...event, publishedAt: "2026-10-02T00:00:00Z" }, visible)).toBe(
      "scheduled",
    );
  });

  it("names why an owner's event is not public", () => {
    expect(eventVisibility({ ...event, status: "draft" }, visible)).toBe("draft");
    expect(eventVisibility({ ...event, status: "cancelled" }, visible)).toBe("cancelled");
    expect(eventVisibility({ ...event, status: "draft", luma }, visible)).toBe("hiddenImport");
    expect(eventVisibility({ ...event, luma }, visible)).toBe("hiddenImport");
    expect(
      eventVisibility(
        { ...event, status: "draft", luma: { available: false, hidden: false } },
        visible,
      ),
    ).toBe("removed");
    expect(eventVisibility({ ...event, luma: { ...luma, hidden: false } }, visible)).toBe("live");
  });

  it("names states that don't depend on the community while its status is unknown", () => {
    const unknown = { communityPublic: null, now };
    expect(eventVisibility(event, unknown)).toBeNull();
    expect(eventVisibility({ ...event, status: "draft" }, unknown)).toBe("draft");
    expect(eventVisibility({ ...event, status: "cancelled" }, unknown)).toBe("cancelled");
    expect(eventVisibility({ ...event, luma }, unknown)).toBe("hiddenImport");
    expect(eventVisibility({ ...event, endsAt: "2026-09-30T00:00:00Z" }, unknown)).toBe("ended");
  });

  it("marks events that have ended, since Explore no longer lists them", () => {
    const past = { ...event, startsAt: "2026-09-20T18:00:00Z", endsAt: "2026-09-20T20:00:00Z" };
    expect(eventVisibility(past, visible)).toBe("ended");
    expect(eventVisibility({ ...past, endsAt: null }, visible)).toBe("ended");
    expect(eventVisibility({ ...past, status: "draft" }, visible)).toBe("draft");
    expect(eventVisibility({ ...past, status: "cancelled" }, visible)).toBe("cancelled");
    expect(eventVisibility({ ...event, endsAt: "2026-10-01T13:00:00Z" }, visible)).toBe("live");
    expect(eventVisibility({ ...past, kind: "social" }, visible)).toBe("live");
  });
});

describe("eventVisibility against the server's public rules", () => {
  it.each(eventVisibilityCases)("$name", ({
    activity,
    earlierEvents,
    community,
    now,
    expected,
  }) => {
    const communityPublic = community.tenantActive && community.profilePublished;
    expect(eventVisibility(activity, { communityPublic, now: Date.parse(now) })).toBe(
      expected.uiState,
    );
    if (expected.inLists) expect(expected.uiState).toBe("live");
    if (expected.uiState === "live") expect(expected.onEventPage).toBe(true);
    if (expected.uiState === "live" && !expected.inLists)
      expect(earlierEvents?.length ?? 0).toBeGreaterThanOrEqual(3);
    if (["scheduled", "published", "draft", "hiddenImport", "removed"].includes(expected.uiState))
      expect(expected.onEventPage || expected.inLists).toBe(false);
    if (["cancelled", "ended"].includes(expected.uiState)) expect(expected.inLists).toBe(false);
  });
});

describe("saveConfirmation", () => {
  const hidden = { communityPublic: false, now };
  const unknown = { communityPublic: null, now };
  const cancelled = { ...event, status: "cancelled" as const };

  it("states the outcome visitors will see", () => {
    expect(saveConfirmation(event, visible)).toBe("events.savedLive");
    expect(saveConfirmation({ ...event, publishedAt: "2026-10-02T00:00:00Z" }, visible)).toBe(
      "events.savedScheduled",
    );
    expect(saveConfirmation(event, hidden)).toBe("events.savedCommunityHidden");
    expect(saveConfirmation({ ...event, status: "draft" }, visible)).toBe("events.savedDraft");
    expect(saveConfirmation({ ...event, endsAt: "2026-09-30T00:00:00Z" }, visible)).toBe(
      "events.savedEnded",
    );
  });

  it("promises a cancelled event's public page only when visitors can open it", () => {
    expect(saveConfirmation(cancelled, visible)).toBe("events.savedCancelled");
    expect(saveConfirmation(cancelled, hidden)).toBe("events.saved");
    expect(saveConfirmation(cancelled, unknown)).toBe("events.saved");
    expect(saveConfirmation({ ...cancelled, publishedAt: "2026-10-02T00:00:00Z" }, visible)).toBe(
      "events.saved",
    );
  });

  it("falls back to a plain confirmation when the community's status is unknown", () => {
    expect(saveConfirmation(event, unknown)).toBe("events.saved");
    expect(saveConfirmation({ ...event, status: "draft" }, unknown)).toBe("events.savedDraft");
  });
});

describe("isWaitingImport", () => {
  it("counts hidden imports that are still public on Luma and have not ended", () => {
    expect(isWaitingImport({ ...event, status: "draft", luma }, now)).toBe(true);
    expect(isWaitingImport({ ...event, luma: { ...luma, hidden: false } }, now)).toBe(false);
    expect(isWaitingImport({ ...event, status: "draft", luma: { available: false } }, now)).toBe(
      false,
    );
    expect(
      isWaitingImport({ ...event, status: "draft", luma, endsAt: "2026-09-30T00:00:00Z" }, now),
    ).toBe(false);
    expect(isWaitingImport({ ...event, status: "draft" }, now)).toBe(false);
  });
});
