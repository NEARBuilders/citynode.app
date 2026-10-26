import { App } from "everything-dev/descriptor";

// Authored app descriptor. The published config is canonicalized to JSON
// from this file; dev-only overrides live in bos.dev.ts (never published).
export default App({
  name: "citynode.app",
  // The base runtime this app extends — inherit the platform, override only what you change.
  extends: "bos://dev.everything.near/everything.dev",
  platform: "2.0.0-rc.24",
  // The NEAR account this app publishes under.
  account: "v1.citynode.near",
  // The gateway: FastKV lookup key and public ingress for this runtime.
  domain: "citynode.app",
  // CI settings: runtime image name, Railway service.
  ci: {
    railway: {
      service: "app",
    },
  },
  // Local API workspace override.
  api: {
    path: "api",
    variables: {
      platformAccount: "v1.citynode.near",
      domain: "citynode.app",
      gatewayDomains: "citynode.app,testnet.citynode.app",
      nearbuildersUrl: "https://nearbuilders.org",
    },
    secrets: ["API_DATABASE_URL", "LUMA_CALENDAR_API_KEYS"],
  },
  // Local UI workspace override.
  ui: {
    path: "ui",
  },
  // Auth attachment — the published @everything-dev/auth-plugin (server + UI)
  // from the extends chain; no local auth workspace. Only the citynode-specific
  // variables/secrets are authored here (child-wins merge over the parent).
  auth: {
    variables: {
      organizationMembershipLimit: 1000,
      deviceLink: {
        clientId: "citynode-web",
      },
      passkey: {
        rpID: "citynode.app",
        rpName: "City Nodes",
        gatewayOrigins: {
          mainnet: ["https://citynode.app"],
          testnet: ["https://testnet.citynode.app"],
        },
      },
      socialProviders: {
        github: {},
        google: {},
      },
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
  },
  // Attached plugins, keyed by registry key. `path` = local workspace, `extends` = published module.
  plugins: {
    registry: {
      path: "plugins/registry",
      name: "registry",
    },
    proposals: {
      path: "plugins/proposals",
      name: "proposals",
      variables: {
        privatePluginIds: [],
      },
      secrets: ["PROPOSALS_DATABASE_URL"],
    },
  },
});
