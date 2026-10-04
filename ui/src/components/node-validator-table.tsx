import type { InferClientOutputs } from "@orpc/client";
import { HardDrivesIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";

type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];

export function NodeValidatorTable({
  validators,
  renderActions,
}: {
  validators: Validator[];
  renderActions?: (validator: Validator) => ReactNode;
}) {
  const translate = useAppTranslation();
  return (
    <ItemGroup data-testid="node-validators">
      {validators.map((validator) => (
        <Item key={validator.id} variant="outline" size="sm">
          <ItemMedia variant="icon">
            <HardDrivesIcon />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full">
              <span className="truncate font-mono">{validator.accountId}</span>
            </ItemTitle>
            <ItemDescription>
              {validator.network} · {validator.protocol}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="flex-wrap">
            {validator.isDefault && <Badge variant="success">{translate("common.default")}</Badge>}
            <Badge variant="outline">
              {presentationLabel(validator.role ?? "member", translate)}
            </Badge>
            {renderActions?.(validator)}
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
