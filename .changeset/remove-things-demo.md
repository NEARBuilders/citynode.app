---
"ui": minor
"api": major
"@everything-dev/auth-plugin": minor
---

Remove the Things demo resource from City Node. The `/things` pages, sidebar item, breadcrumbs and translations are deleted; `things` is no longer a feature area or part of the default Community team's grants (existing grants are ignored); and the `template` and `votes` plugins are dropped from City Node's runtime config. Breaking: `/api/things` and its MCP tools are gone, and starters scaffolded from City Node (`bos init --extends v1.citynode.near/citynode.app`) no longer include the Things pages or offer `--plugins template` (scaffold from everything.dev instead). Admin proposal approval no longer has a `template` branch, so a remaining `template` proposal is approved without being applied.
