// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { TenantShardDogDrops } from "./-tenant-sharddog-drops";

const harness = vi.hoisted(() => ({
  getShardDogDrops: vi.fn(),
  setShardDogDrop: vi.fn(),
}));

vi.mock("@/app", () => ({
  useApiClient: () => harness,
}));

const drops = {
  enabled: true,
  canEdit: true,
  membershipDropId: null,
  events: [
    {
      eventId: "event-1",
      title: "Builders night",
      startsAt: "2026-12-01T18:00:00.000Z",
      dropId: "night-drop",
    },
  ],
};

afterEach(() => {
  cleanup();
  harness.getShardDogDrops.mockReset();
  harness.setShardDogDrop.mockReset();
});

function renderDrops() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantShardDogDrops organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe("Community settings ShardDog drops", () => {
  it("stays hidden while ShardDog is off or the viewer can't edit", async () => {
    harness.getShardDogDrops.mockResolvedValueOnce({ ...drops, enabled: false });
    const { unmount } = renderDrops();
    await waitFor(() => expect(harness.getShardDogDrops).toHaveBeenCalled());
    expect(screen.queryByTestId("tenant.section.sharddog")).toBeNull();
    unmount();

    harness.getShardDogDrops.mockResolvedValueOnce({ ...drops, canEdit: false });
    renderDrops();
    await waitFor(() => expect(harness.getShardDogDrops).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("tenant.section.sharddog")).toBeNull();
  });

  it("saves a trimmed membership drop and removes an event drop", async () => {
    harness.getShardDogDrops.mockResolvedValue(drops);
    harness.setShardDogDrop.mockResolvedValue(drops);
    renderDrops();

    const input = await screen.findByTestId("tenant.sharddog.membership-form-input");
    fireEvent.change(input, { target: { value: " city-member " } });
    fireEvent.click(screen.getByTestId("tenant.sharddog.membership-form-save"));
    await waitFor(() =>
      expect(harness.setShardDogDrop).toHaveBeenCalledWith({
        organizationId: "org-1",
        dropId: "city-member",
      }),
    );

    fireEvent.click(screen.getByTestId("tenant.sharddog.event-event-1-clear"));
    await waitFor(() =>
      expect(harness.setShardDogDrop).toHaveBeenLastCalledWith({
        organizationId: "org-1",
        eventId: "event-1",
        dropId: null,
      }),
    );
  });

  it("refuses a drop id with characters ShardDog ids don't use", async () => {
    harness.getShardDogDrops.mockResolvedValue(drops);
    renderDrops();

    const input = await screen.findByTestId("tenant.sharddog.membership-form-input");
    fireEvent.change(input, { target: { value: "drop/../x" } });
    expect(screen.getByTestId("tenant.sharddog.membership-form-save")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/Use letters, numbers/)).toBeTruthy();
  });
});
