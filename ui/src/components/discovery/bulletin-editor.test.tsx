// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { BulletinEditor } from "./bulletin-editor";

const api = vi.hoisted(() => ({
  getNode: vi.fn(),
  setNodeBulletin: vi.fn(),
}));

vi.mock("@/app", () => ({ useApiClient: () => api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps the saved text while the community reloads instead of flashing the old bulletin", async () => {
  const node = (bulletin: string) => ({ id: "node-1", metadata: { bulletin } });
  let release!: () => void;
  api.getNode.mockResolvedValueOnce(node("Old news")).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(node("Fresh news"));
      }),
  );
  api.setNodeBulletin.mockResolvedValue({});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BulletinEditor nodeId="node-1" />
    </QueryClientProvider>,
  );

  const textarea = (await screen.findByDisplayValue("Old news")) as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "Fresh news" } });
  fireEvent.submit(textarea.closest("form")!);

  await waitFor(() => expect(api.getNode).toHaveBeenCalledTimes(2));
  expect(textarea.value).toBe("Fresh news");
  release();
  await waitFor(() => expect(textarea.value).toBe("Fresh news"));
});
