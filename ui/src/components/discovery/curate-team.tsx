import { DotsThreeIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { InfoPopover } from "@/components/info-popover";
import { SectionHeader } from "@/components/layout/section-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";

type Person = { id: string; name: string | null; image: string | null };

export function initialsFor(name: string | null, fallback: string) {
  const source = (name ?? "").trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0]}${parts[1]?.[0]}` : source.slice(0, 2)).toUpperCase();
}

function PersonMedia({ person }: { person: Person }) {
  return (
    <ItemMedia>
      <Avatar>
        {person.image && <AvatarImage src={person.image} alt="" />}
        <AvatarFallback>{initialsFor(person.name, person.id)}</AvatarFallback>
      </Avatar>
    </ItemMedia>
  );
}

export function CurateTeam({ curators }: { curators: string[] }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<Person | null>(null);
  const term = query.trim();

  const people = useQueries({
    queries: curators.map((id) => ({
      queryKey: ["curate-person", id],
      staleTime: 5 * 60 * 1000,
      queryFn: async (): Promise<Person> => {
        const { data } = await auth.admin.getUser({ query: { id } });
        return { id, name: data?.name ?? null, image: data?.image ?? null };
      },
    })),
  });
  const search = useQuery({
    queryKey: ["curate-people-search", term],
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Person[]> => {
      const { data } = await auth.admin.listUsers({
        query: { searchValue: term, searchField: "name", searchOperator: "contains", limit: 5 },
      });
      return (data?.users ?? []).map((user) => ({
        id: user.id,
        name: user.name,
        image: user.image ?? null,
      }));
    },
  });

  const setCurator = useMutation({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      api.setDiscoveryCurator({ userId, enabled }),
    onSuccess: async (_, { enabled }) => {
      toast.success(enabled ? translate("curators.added") : translate("curators.removed"));
      setQuery("");
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["discover"] });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const matches = (search.data ?? []).filter((person) => !curators.includes(person.id));
  const add = (userId: string) => setCurator.mutate({ userId, enabled: true });

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <SectionHeader
        title={translate("curators.title")}
        description={translate("curators.description")}
        action={
          <InfoPopover
            title={translate("curators.permissions")}
            body={translate("curators.permissionsDescription")}
            testId="curate-team-info"
          />
        }
      />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (term) add(matches[0]?.id ?? term);
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <UsersThreeIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={translate("curators.find")}
            data-testid="curate-team-search"
            placeholder={translate("curators.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="default"
              data-testid="curate-team-add"
              disabled={!term || setCurator.isPending}
            >
              <PlusIcon />
              {translate("common.add")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {matches.length > 0 && (
          <ItemGroup data-testid="curate-team-matches">
            {matches.map((person) => (
              <Item key={person.id} variant="muted" size="sm">
                <PersonMedia person={person} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{person.name || translate("common.unnamed")}</ItemTitle>
                  <ItemDescription>
                    <span className="block truncate font-mono">{person.id}</span>
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={setCurator.isPending}
                    data-testid={`curate-team-match-${person.id}`}
                    onClick={() => add(person.id)}
                  >
                    {translate("common.add")}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </form>

      {curators.length === 0 ? (
        <EmptyState
          icon={UsersThreeIcon}
          title={translate("curators.empty")}
          description={translate("curators.emptyHint")}
        />
      ) : (
        <ItemGroup data-testid="curate-team-list">
          {curators.map((id, index) => {
            const person = people[index]?.data ?? { id, name: null, image: null };
            const label = person.name || translate("curators.unknown");
            return (
              <Item key={id} variant="outline" data-testid={`curate-team-member-${id}`}>
                <PersonMedia person={person} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{label}</ItemTitle>
                  <ItemDescription>
                    <span className="block truncate font-mono">{id}</span>
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={translate("common.moreNamed", { name: label ?? "" })}
                          data-testid={`curate-team-menu-${id}`}
                        />
                      }
                    >
                      <DotsThreeIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRemoving({ ...person, name: label })}
                      >
                        {translate("curators.remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={translate("common.removeQuestion", {
          name: removing?.name ?? translate("curators.personFallback"),
        })}
        description={translate("curators.removeDescription")}
        confirmLabel={translate("curators.removeAccess")}
        cancelLabel={translate("common.cancel")}
        variant="destructive"
        isPending={setCurator.isPending}
        onConfirm={() => {
          if (removing) setCurator.mutate({ userId: removing.id, enabled: false });
        }}
      />
    </section>
  );
}
