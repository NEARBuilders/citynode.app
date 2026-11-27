export function joinReturnPath(place: string): string {
  return `/join?place=${encodeURIComponent(place)}`;
}
