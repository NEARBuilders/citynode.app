import { InfoIcon } from "@phosphor-icons/react";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";

export function DaoProposalsNote() {
  const translate = useAppTranslation();
  return (
    <Item variant="muted" data-testid="dashboard-node.dao-proposals-note">
      <ItemMedia variant="icon">
        <InfoIcon className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("dashboard.daoProposals")}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {translate("dashboard.daoProposalsUnavailable")}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
