import { LockSimpleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";

export function CannotEditState({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  return (
    <div data-testid="community-cannot-edit">
      <EmptyState
        icon={LockSimpleIcon}
        title={translate("community.cannotEdit")}
        description={translate("community.cannotEditHint")}
        action={
          <Button
            variant="outline"
            nativeButton={false}
            data-testid="community-cannot-edit-overview"
            render={<Link to="/dashboard/node" search={{ nodeId }} />}
          >
            {translate("community.backOverview")}
          </Button>
        }
      />
    </div>
  );
}
