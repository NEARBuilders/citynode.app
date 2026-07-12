---
"ui": patch
---

Fix CSS chunk filename collision by overriding `CssExtractRspackPlugin.chunkFilename` to `static/css/async/[name].[contenthash].css`

Async CSS chunks (e.g., from lazy-loaded `@uiw/react-md-editor`) were all emitting
to the same path `static/css/async/style.css`. The plugin override gives each async
chunk a unique, content-hashed filename while keeping the entry CSS at `style.css`.
