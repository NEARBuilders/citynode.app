import { Near, type WalletConnection } from "near-kit";
import { getAuthClient } from "./auth-client";

type NestedAction = Record<string, Record<string, any>>;

function convertActions(actions: NestedAction[]): any[] {
  return actions.map((action) => {
    const key = Object.keys(action)[0];
    const params = action[key];
    switch (key) {
      case "functionCall":
        return {
          type: "FunctionCall",
          methodName: params.methodName,
          args: params.args,
          gas: String(params.gas),
          deposit: String(params.deposit),
        };
      case "transfer":
        return { type: "Transfer", deposit: String(params.deposit) };
      case "stake":
        return {
          type: "Stake",
          stake: String(params.stake),
          publicKey: String(params.publicKey),
        };
      case "addKey":
        return {
          type: "AddKey",
          publicKey: String(params.publicKey),
          accessKey: params.accessKey,
        };
      case "deleteKey":
        return { type: "DeleteKey", publicKey: String(params.publicKey) };
      case "deleteAccount":
        return { type: "DeleteAccount", beneficiaryId: params.beneficiaryId };
      case "createAccount":
        return { type: "CreateAccount" };
      case "deployContract":
        return { type: "DeployContract", code: params.code };
      default:
        throw new Error(`Unsupported action type: ${key}`);
    }
  });
}

function createWalletConnection(): WalletConnection {
  const wallet = () => getAuthClient().near.wallet;

  return {
    getAccounts: async () => {
      const accountId = wallet().accountId();
      if (!accountId) return [];
      return [{ accountId, publicKey: undefined as any }];
    },
    signAndSendTransaction: async (params) => {
      return wallet().sendTransaction({
        receiverId: params.receiverId,
        actions: convertActions(params.actions as NestedAction[]),
        signerId: params.signerId,
      });
    },
    signMessage: async (params) => {
      return wallet().signMessage({
        message: params.message,
        recipient: params.recipient,
        nonce: params.nonce,
      });
    },
    signDelegateActions: async (params) => {
      return wallet().signDelegateActions({
        delegateActions: params.delegateActions.map((d) => ({
          actions: convertActions(d.actions as NestedAction[]),
          receiverId: d.receiverId,
        })),
        signerId: params.signerId,
      }) as any;
    },
  };
}

let _nearClient: Near | undefined;

export function getNearClient(): Near {
  if (!_nearClient) {
    _nearClient = new Near({
      network: "mainnet",
      wallet: createWalletConnection(),
    });
  }
  return _nearClient;
}
