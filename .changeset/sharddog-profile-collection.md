---
"api": minor
"ui": minor
---

A member's public profile now shows their City Node collectibles: the membership and event ShardDogs they've been awarded for checking in, newest first, each with its "View in ShardDog" link. The new public `getAccountCollectibles` reads our own award records (ShardDog has no read call yet), lists only awarded badges from live communities and published events, and returns nothing while the ShardDog flag is off. With no badges, the profile shows a short empty state. Closes #606, part of #602.
