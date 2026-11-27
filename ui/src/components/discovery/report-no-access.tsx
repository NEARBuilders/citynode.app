import type { ComponentProps } from "react";
import { EmptyState } from "@/components/empty-state";
import { useAppTranslation } from "@/i18n/runtime";

export function ReportNoAccess({ icon }: { icon: ComponentProps<typeof EmptyState>["icon"] }) {
  const translate = useAppTranslation();
  return (
    <EmptyState
      icon={icon}
      title={translate("report.noAccess")}
      description={translate("report.noAccessDescription")}
    />
  );
}
