---
"everything-dev": patch
---

Fix `bos init` plugin selection: choosing "override plugins" but selecting zero plugins now correctly omits all parent plugins instead of defaulting to all of them. The `init` handler previously treated an empty `plugins` array (`[]`) the same as `undefined` ("not specified"), overwriting the user's explicit choice with all parent plugin keys.