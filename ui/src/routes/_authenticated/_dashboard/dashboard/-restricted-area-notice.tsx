import { ShieldWarningIcon } from "@phosphor-icons/react";
import { FEATURE_AREA_LABELS, type FeatureArea } from "@/lib/feature-areas";

export function RestrictedAreaNotice({ area }: { area: FeatureArea }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border-2 border-border-strong bg-card p-4 text-sm"
      data-testid="workspace-restricted-notice"
    >
      <ShieldWarningIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p>
        <span className="font-medium">{FEATURE_AREA_LABELS[area]}</span> isn't available in your
        current team workspace. Switch teams from the sidebar, or ask an organization owner to grant
        your team this area.
      </p>
    </div>
  );
}
