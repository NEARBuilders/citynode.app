import { LockSimpleIcon } from "@phosphor-icons/react";
import { Trans } from "everything-dev/ui/i18n";
import { useAppTranslation } from "@/i18n/runtime";
import { FEATURE_AREA_MESSAGES, type FeatureArea } from "@/lib/feature-areas";

export function RestrictedAreaNotice({ area }: { area: FeatureArea | "admin" }) {
  const translate = useAppTranslation();
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-2xl bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground"
      data-testid="workspace-restricted-notice"
    >
      <LockSimpleIcon className="size-4 shrink-0" />
      {area === "admin" ? (
        <p>
          <Trans
            id="workspace.adminOnly"
            values={{ area: <span className="font-medium">{translate("common.admin")}</span> }}
          />
        </p>
      ) : (
        <p>
          <Trans
            id="workspace.areaRestricted"
            values={{
              area: <span className="font-medium">{translate(FEATURE_AREA_MESSAGES[area])}</span>,
            }}
          />
        </p>
      )}
    </div>
  );
}
