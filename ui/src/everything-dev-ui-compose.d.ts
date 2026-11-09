// TODO(#839) everything-dev@2.0.0-rc.41 ships no declaration for
// "everything-dev/ui/compose" (exports map points types at dist/ui/compose.d.mts
// which the dts build never emits). Remove this shim when a framework release
// ships compose declarations.
declare module "everything-dev/ui/compose" {
  export function constructTree(
    input: import("everything-dev/ui/manifest").ConstructInput,
  ): Promise<import("everything-dev/ui/manifest").ConstructedTree>;
}
