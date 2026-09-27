import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";

export const BUNDLE_CDN_DOMAIN = "cdn.everything.dev";

export default Alchemy.Stack(
  "CityNodeInfra",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;
    const bucketName = process.env.BOS_STORAGE_BUCKET ?? "everything-bundles";

    const bucket = yield* Cloudflare.R2.Bucket("Bundles", {
      name: bucketName,
      domains: [BUNDLE_CDN_DOMAIN],
    }).pipe(RemovalPolicy.retain());

    const s3Token = yield* Cloudflare.ApiToken.AccountApiToken("BundlesS3", {
      name: "everything-bundles-s3",
      accountId,
      policies: Output.map(bucket.id, (bucketId) => [
        {
          effect: "allow" as const,
          permissionGroups: [
            "Workers R2 Storage Bucket Item Read",
            "Workers R2 Storage Bucket Item Write",
          ],
          resources: {
            [`com.cloudflare.edge.r2.bucket.${accountId}/${bucketId}`]: "*",
          },
        },
      ]),
    });

    return {
      bucketName,
      domain: BUNDLE_CDN_DOMAIN,
      s3Endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      s3Region: "auto",
      s3AccessKeyId: s3Token.tokenId,
      s3SecretAccessKey: s3Token.value,
    };
  }),
);
