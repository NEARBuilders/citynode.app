---
"api": patch
---

A ShardDog drop whose image isn't an https link (such as `ipfs://` or `http://`) now keeps its name on the community collectibles card and only drops the image. Before, the whole lookup failed, the card lost the name too, and the server asked ShardDog about that drop again every minute.
