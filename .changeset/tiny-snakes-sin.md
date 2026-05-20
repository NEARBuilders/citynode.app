---
"everything-dev": minor
"host": minor
"@everything-dev/apps-plugin": minor
---

Support account-relative tenant resolution on shared hosts so subdomains derive from the active runtime account instead of `label.near`, and allow nested tenant labels in the resolver and tests. Expose runtime lineage in the apps registry by deriving parent, root, depth, and extendsChain from `extends`, and add registry list filters for parent and root traversal.
