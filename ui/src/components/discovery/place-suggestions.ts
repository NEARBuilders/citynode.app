type SuggestablePlace = { id: string; slug: string; name: string; activated: boolean };

export function suggestPlaces<T extends SuggestablePlace>(places: T[], query: string, limit = 5) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rank = (place: T) => {
    const name = place.name.toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return place.slug.includes(needle.replace(/\s+/g, "-")) ? 3 : -1;
  };
  return places
    .map((place) => ({ place, rank: rank(place) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((entry) => entry.place);
}
