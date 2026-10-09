import { API, App, Plugin, UI } from "everything-dev/descriptor";

/**
 * The citynode.app runtime — a base-runtime consumer. Host, base UI, and
 * inherited plugins come from the published base
 * (bos://dev.everything.near/everything.dev); only the slots citynode
 * actually overrides are authored here. Authored fields only — production
 * URLs and integrity are pipeline state.
 */
export default App({
  extends: "bos://dev.everything.near/everything.dev",
  name: "citynode.app",
  account: "v1.citynode.near",
  domain: "citynode.app",
  title: "City Nodes",
  description:
    "Decentralized city nodes on NEAR — each city is a tenant with its own validator pool you can stake to.",
  staging: { domain: "testnet.citynode.app", account: "v1.citynode.testnet" },
  repository: "https://github.com/NEARBuilders/citynode.app",
  ci: { railway: { service: "app" } },
  ui: UI({ path: "ui" }),
  api: API({
    path: "api",
    variables: {
      platformAccount: "v1.citynode.near",
      gatewayDomains: "citynode.app,testnet.citynode.app",
    },
    secrets: ["API_DATABASE_URL", "LUMA_CALENDAR_API_KEYS"],
  }),
  auth: Plugin("auth").path("plugins/auth", {
    name: "@everything-dev/auth-plugin",
    ui: { name: "auth-ui", path: "plugins/auth/ui" },
    secrets: [
      "AUTH_DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "GITHUB_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "FASTNEAR_API_KEY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "RESEND_API_KEY",
      "NEAR_RELAYER_PRIVATE_KEY_MAINNET",
      "NEAR_RELAYER_PRIVATE_KEY_TESTNET",
    ],
    variables: {
      organizationMembershipLimit: 1000,
      deviceLink: { clientId: "citynode-web" },
      passkey: {
        rpID: "citynode.app",
        rpName: "City Nodes",
        gatewayOrigins: {
          mainnet: ["https://citynode.app"],
          testnet: ["https://testnet.citynode.app"],
        },
      },
      socialProviders: { github: {}, google: {} },
      siwn: {
        recipients: {
          mainnet: "v1.citynode.near",
          testnet: "v1.citynode.testnet",
        },
        relayer: {
          mainnet: {
            whitelistedContracts: ["v1.citynode.near", "dev.everything.near"],
            maxGasPerTransaction: "400000000000000",
            maxDepositPerTransaction: "0",
          },
          testnet: {
            whitelistedContracts: ["v1.citynode.testnet", "dev.allthethings.testnet"],
            maxGasPerTransaction: "400000000000000",
            maxDepositPerTransaction: "0",
          },
        },
        sessionGasKey: {
          mainnet: {
            receiverId: "dev.everything.near",
            methodNames: ["__fastdata_kv"],
          },
          testnet: {
            receiverId: "dev.allthethings.testnet",
            methodNames: ["__fastdata_kv"],
          },
        },
      },
    },
  }),
  plugins: {
    registry: Plugin("registry").path("plugins/registry"),
    proposals: Plugin("proposals").path("plugins/proposals", {
      variables: { privatePluginIds: [] },
      secrets: ["PROPOSALS_DATABASE_URL"],
    }),
  },
});
