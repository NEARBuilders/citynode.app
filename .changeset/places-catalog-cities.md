---
"api": patch
---

The places seed now adds about 34,000 cities from GeoNames `cities15000`, each as a pin under its subdivision (or its country when the subdivision is unknown). City slugs are the plain name for the most populous city with that name; others get a country prefix, or country and subdivision when the name repeats inside a country (`us-il-springfield`). Each city gets its GeoNames id as an alias, and a few curated short forms (`nyc`, `sf`, `dc`, `kl`, `cdmx`) resolve too, so `resolvePlace("chicago")` and `resolvePlace("nyc")` now find a place. A new `curated` alias kind needs migration `0011`. The seed summary prints the count at each level of the hierarchy.
