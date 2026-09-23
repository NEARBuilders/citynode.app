import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageContainer } from "@/components";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <PageContainer variant="wide">
      <Outlet />
    </PageContainer>
  );
}
