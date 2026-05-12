---
"everything-dev": minor
"api": patch
"every-plugin": patch
"@everything-dev/projects-plugin": patch
"@everything-dev/apps-plugin": patch
"@every-plugin/settings": patch
"host": patch
"ui": patch
---

Catalog-ify rspack/rsbuild packages and propagate via bos upgrade/sync

- Add @rspack/core, @rspack/cli, @rsbuild/core, @rsbuild/plugin-react to root package.json catalog
- Convert all workspace package.json rspack/rsbuild deps from version ranges to catalog: refs
- Change every-plugin @rspack/core peerDep from exact 1.7.4 to range ^1.7.4
- Add CATALOG_TOOL_PACKAGES to manifest-normalizer for catalog: conversion during init/sync
- Extend bos upgrade to also bump catalog tool packages to latest npm versions
- Extend bos status to report catalog tool package versions