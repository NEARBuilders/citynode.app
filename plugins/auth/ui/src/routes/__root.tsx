import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../context";
import "../styles.css";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});
