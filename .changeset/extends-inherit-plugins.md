---
"everything-dev": patch
---

fix: inherit parent plugins through extends when child doesn't declare plugins

Previously, `mergeBosConfigWithExtends` always stripped parent plugins, so a child
config that only extended a parent (without declaring its own `plugins`) would get
no plugins at all. This broke the common pattern of extending an app for its API
without also re-listing every parent plugin.

Now: parent plugins are inherited when the child doesn't have a `plugins` key.
Child with explicit `plugins: { ... }` still gets only its own (no inheritance).
