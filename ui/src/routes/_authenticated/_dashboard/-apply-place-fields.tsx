import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppTranslation } from "@/i18n/runtime";
import {
  placeChildrenQueryOptions,
  placeResolutionQueryOptions,
  rootPlacesQueryOptions,
} from "@/lib/queries/places";
import type { ApplicationPlace } from "./-node-application";

type PlaceOption = ApplicationPlace;

const LEVEL_LABELS = ["apply.place.country", "apply.place.region", "apply.place.city"] as const;

export function PlaceLevel({
  level,
  options,
  value,
  onChange,
  idPrefix = "application-place",
  testIdPrefix = "apply.place",
}: {
  level: number;
  options: PlaceOption[];
  value: string | null;
  onChange: (place: PlaceOption) => void;
  idPrefix?: string;
  testIdPrefix?: string;
}) {
  const t = useAppTranslation();
  const id = `${idPrefix}-${level}`;
  const sorted = [...options].sort((left, right) => left.name.localeCompare(right.name));
  const label = t(LEVEL_LABELS[Math.min(level, LEVEL_LABELS.length - 1)]);
  return (
    <Field className="sm:flex-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={sorted.map((option) => ({ label: option.name, value: option.id }))}
        value={value}
        onValueChange={(placeId) => {
          const place = options.find((option) => option.id === placeId);
          if (place) onChange(place);
        }}
      >
        <SelectTrigger id={id} className="w-full" data-testid={`${testIdPrefix}-${level}`}>
          <SelectValue placeholder={t("apply.place.choose")} />
        </SelectTrigger>
        <SelectContent>
          {sorted.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ChildLevel({
  parentId,
  ...level
}: Omit<Parameters<typeof PlaceLevel>[0], "options"> & { parentId: string }) {
  const apiClient = useApiClient();
  const { data: children = [] } = useQuery(placeChildrenQueryOptions(apiClient, parentId));
  if (children.length === 0) return null;
  return <PlaceLevel {...level} options={children} />;
}

export function ApplyPlaceFields({
  path,
  onPathChange,
}: {
  path: PlaceOption[];
  onPathChange: (path: PlaceOption[]) => void;
}) {
  const t = useAppTranslation();
  const apiClient = useApiClient();
  const { data: roots = [] } = useQuery(rootPlacesQueryOptions(apiClient));
  const selected = path.at(-1) ?? null;
  const { data: resolution, isFetching } = useQuery(
    placeResolutionQueryOptions(apiClient, selected?.slug ?? ""),
  );
  const choose = (level: number) => (place: PlaceOption) =>
    onPathChange([...path.slice(0, level), place]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        <PlaceLevel level={0} options={roots} value={path[0]?.id ?? null} onChange={choose(0)} />
        {path.map((place, index) => (
          <ChildLevel
            key={place.id}
            level={index + 1}
            parentId={place.id}
            value={path[index + 1]?.id ?? null}
            onChange={choose(index + 1)}
          />
        ))}
      </div>
      {selected && (
        <FieldDescription data-testid="apply.place-status">
          {isFetching
            ? t("apply.place.checking")
            : resolution?.community
              ? t("apply.place.active", { name: selected.name })
              : t("apply.place.inactive", { name: selected.name })}
        </FieldDescription>
      )}
    </div>
  );
}
