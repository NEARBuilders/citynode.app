import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../context";

/**
 * Minimal root — the host's core tree owns head chrome, error boundaries,
 * and session bootstrap. This root exists for route generation and context
 * typing only; grafted mount children reparent onto the core mounts.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});
