# ADRs

Architecture decisions live in the **framework repo**, not here:

- Index: <https://github.com/NEARBuilders/everything-dev/tree/main/docs/adr>

This repo cites ADR numbers in code comments and tickets. Use this table to
resolve them without guessing (unknown numbers: search the index above).

| ADR | Title / topic | Link |
|---|---|---|
| 0005 | `bos.app.ts` authored descriptor | [0005-app-ts-authored-descriptor.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0005-app-ts-authored-descriptor.md) |
| 0008 | Manifest composition | [0008-manifest-composition.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0008-manifest-composition.md) |
| 0010 | Composition contracts, kit, and precedence | [0010-composition-contracts-kit-and-precedence.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0010-composition-contracts-kit-and-precedence.md) |
| 0012 | Session gas keys | [0012-session-gas-keys.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0012-session-gas-keys.md) |
| 0020 | Child bundle storage (R2) | [0020-child-bundle-storage-r2.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0020-child-bundle-storage-r2.md) |
| 0021 | Universal runtime image | [0021-universal-runtime-image.md](https://github.com/NEARBuilders/everything-dev/blob/main/docs/adr/0021-universal-runtime-image.md) |
| 0023 | UI override seam (app-owned router/app) | search the index |
| 0032 | Framework-owned files & upstream-change protocol | search the index |
| 0033 | (cited in UI comments) | search the index |
| 0034 | Platform release manifest / single pin | search the index |

## Recording a new decision here

If a decision is **specific to this child app** (not the framework), add a
numbered ADR in this directory and link it above. Framework-wide decisions belong
upstream so every child inherits them.
