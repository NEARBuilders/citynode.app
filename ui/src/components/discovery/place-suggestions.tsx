import { Link } from "@tanstack/react-router";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeKindLabel } from "@/lib/node-kind";

type SuggestablePlace = {
  id: string;
  slug: string;
  name: string;
  label: string | null;
  activated: boolean;
};

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const NO_MATCH = Number.POSITIVE_INFINITY;

function matchRank(place: SuggestablePlace, query: string) {
  const needle = fold(query);
  const name = fold(place.name);
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  return place.slug.includes(needle.replace(/\s+/g, "-")) ? 3 : NO_MATCH;
}

export function matchesPlace(place: SuggestablePlace, query: string) {
  return !fold(query) || matchRank(place, query) !== NO_MATCH;
}

export function suggestPlaces<T extends SuggestablePlace>(places: T[], query: string, limit = 5) {
  if (!fold(query)) return [];
  return places
    .map((place) => ({ place, rank: matchRank(place, query) }))
    .filter((entry) => entry.rank !== NO_MATCH)
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((entry) => entry.place);
}

export function PlaceSuggestions({ places }: { places: SuggestablePlace[] }) {
  const t = useAppTranslation();
  return (
    <ul className="flex flex-col gap-2" data-testid="explore-place-suggestions">
      {places.map((place) => {
        const copy: { line: AppMessageId; cta: AppMessageId } = place.activated
          ? { line: "explore.empty.placeLive", cta: "explore.empty.placeOpen" }
          : { line: "explore.empty.placeMissing", cta: "explore.empty.placeStart" };
        return (
          <li key={place.id}>
            {t(copy.line, { place: place.name })}
            {place.label ? (
              <span className="ms-1 text-sm">({nodeKindLabel(place.label, place.label, t)})</span>
            ) : null}
            <Link
              to="/places/$slug"
              params={{ slug: place.slug }}
              className="ms-1 font-medium text-foreground underline underline-offset-4"
              data-testid={`explore-place-suggestion-${place.slug}`}
            >
              {t(copy.cta)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
