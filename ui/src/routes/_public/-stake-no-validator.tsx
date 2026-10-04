import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";

type ChildNode = { id: string; name: string; slug: string };

export function StakeNoValidator({ name, childNodes }: { name: string; childNodes: ChildNode[] }) {
  const translate = useAppTranslation();
  return (
    <section className="flex flex-col gap-4" data-testid="stake.no-validator">
      <SectionHeader
        title={translate("stake.noValidatorNamed", { name: name ?? "" })}
        description={
          childNodes.length > 0 ? translate("stake.pickChild") : translate("stake.checkBack")
        }
      />
      {childNodes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {childNodes.map((child) => (
            <li key={child.id}>
              <Item
                variant="outline"
                size="sm"
                render={<Link to="/stake" search={{ node: child.slug, nodeId: child.id }} />}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle>
                    <span className="capitalize">{child.name}</span>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ArrowRightIcon className="text-muted-foreground" />
                </ItemActions>
              </Item>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
