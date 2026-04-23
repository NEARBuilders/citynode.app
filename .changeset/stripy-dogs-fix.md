---
"every-plugin": patch
---

Strip `development` exports conditions from published package and override rspack `conditionNames` to prevent resolving to `.ts` source files in npm-installed projects
