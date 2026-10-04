import { createFileRoute, Outlet } from "@tanstack/react-router";
import "../../styles.css";
import { LoginI18nProvider } from "@/i18n/runtime";

export const Route = createFileRoute("/_public/login")({
  ssr: false,
  component: LoginLayout,
});

function LoginLayout() {
  return (
    <LoginI18nProvider>
      <Outlet />
    </LoginI18nProvider>
  );
}
