// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RootError } from "./root-error";
import { RootNotFound } from "./root-not-found";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function showFallback(path: string) {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const root = createRootRoute({
    component: Outlet,
    errorComponent: RootError,
    notFoundComponent: RootNotFound,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <h1>Home</h1>,
  });
  const broken = createRoute({
    getParentRoute: () => root,
    path: "/broken",
    beforeLoad: () => {
      throw new Error("Failed before layout");
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([home, broken]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("document fallbacks", () => {
  it.each([
    ["/missing", "Page not found", "This link may be old, or the page has moved."],
    [
      "/broken",
      "Something went wrong",
      "The app hit an error before it could load. Try again in a moment.",
    ],
  ])("renders %s without application providers and can return home", async (path, title, body) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await showFallback(path);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Back home" });
    expect(link.getAttribute("href")).toBe("/");
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeTruthy();
  });
});
