import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/login")({
  ssr: false,
  component: LoginLayout,
});

function LoginLayout() {
  return <Outlet />;
}
