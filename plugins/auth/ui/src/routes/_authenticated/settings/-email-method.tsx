import { EnvelopeIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useLoginTranslation } from "@/i18n/runtime";
import { MethodHeader } from "./-method-header";

export function EmailMethod({ email, onAdd }: { email: string | null; onAdd: () => void }) {
  const translate = useLoginTranslation();
  const hasEmail = !!email;
  return (
    <section className="flex flex-col gap-4" data-testid="settings.email">
      <MethodHeader title={translate("auth.common.email")} />
      <Item variant="outline">
        <ItemMedia variant="icon">
          <EnvelopeIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{translate("auth.email.address")}</ItemTitle>
          <ItemDescription className="break-all">
            {hasEmail ? email : translate("auth.email.description")}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full sm:w-auto">
          {hasEmail ? (
            <Badge variant="secondary">{translate("auth.common.linked")}</Badge>
          ) : (
            <Button
              className="w-full sm:w-auto"
              onClick={onAdd}
              data-testid="settings.email-add-button"
            >
              {translate("auth.email.add")}
            </Button>
          )}
        </ItemActions>
      </Item>
    </section>
  );
}
