---
"every-plugin": patch
---

Plugin routes lose `validateSearch` and `ssr` during composition: the generated `routeConfig.gen.ts` and `constructTree` now carry a route's full authored contract — `validateSearch`, `search` middlewares, `params`, `loaderDeps`, `context`, `ssr`, `staleTime`, `gcTime` and `shouldReload` — alongside the loader, head, static data and components they already passed. Previously these were dropped, so search validation (including redirect sanitization) in plugin routes was not applied, `loaderDeps` never reached loaders, and `ssr: false` routes were server-rendered. Regenerate route configs with `every-plugin build`/`bos dev` to pick this up.
