/**
 * Graftable route tree export — the monolith's own tree as the core ui
 * plugin's `./tree` expose. The host composes plugin subtrees onto it by
 * mount declarations (`_public`, `_authenticated`, `_admin`, `_dashboard`).
 */
import { routeTree } from "./routeTree.gen";

export default routeTree;
