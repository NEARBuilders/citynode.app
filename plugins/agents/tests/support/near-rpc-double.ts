import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { EVM_WALLET_CODE_ID, PASSKEY_WALLET_CODE_ID } from "@near-intents-agent-api/owner-auth";

/**
 * Local NEAR RPC for owner-wallet flows: final block, reviewed global wallet code hashes, `0s`
 * wallet accounts bound to that code and owner-authorization view calls. It never executes a
 * transaction.
 */
export async function startNearRpc() {
  const contracts = new Map<string, string>();
  /** NEAR Intents balances every custody account holds, by token id. */
  const intentsHeld: Record<string, string> = {};
  const globalCodeHashes = new Map<string, string>([
    [PASSKEY_WALLET_CODE_ID, "qD9cxbe38rJn7BwUBtqaC2vVAiYD7TS4vnrafccHsRp"],
    [EVM_WALLET_CODE_ID, "FkAmDpjc2HaoFmU9xwgG6x5oJUXnpxAREtTMZi5UcgRy"],
  ]);
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This local RPC fixture handles all wallet query variants in one request listener.
    request.on("end", () => {
      const rpc = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id: string | number;
        method?: string;
        params?: {
          account_id?: string;
          request_type?: string;
          args_base64?: string;
          block_id?: string;
        };
      };
      const accountId = rpc.params?.account_id ?? "";
      response.writeHead(200, { "content-type": "application/json" });
      if (rpc.params?.request_type === "view_access_key") {
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              nonce: 1,
              permission: "FullAccess",
              block_height: 100,
              block_hash: "11111111111111111111111111111111",
            },
          }),
        );
        return;
      }
      if (rpc.method === "block") {
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { header: { hash: "test-final-block" } },
          }),
        );
        return;
      }
      if (rpc.params?.request_type === "view_global_contract_code_by_account_id") {
        assert.equal(rpc.params.block_id, "test-final-block");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { hash: globalCodeHashes.get(accountId), block_hash: "test-final-block" },
          }),
        );
        return;
      }
      if (rpc.params?.request_type === "call_function" && accountId === "intents.near") {
        const args = JSON.parse(
          Buffer.from(rpc.params.args_base64 ?? "", "base64").toString("utf8"),
        ) as { token_ids?: string[] };
        const value =
          (rpc.params as { method_name?: string }).method_name === "mt_tokens_for_owner"
            ? Object.keys(intentsHeld).map((token_id) => ({ token_id }))
            : (args.token_ids ?? []).map((token) => intentsHeld[token] ?? "0");
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              result: [...Buffer.from(JSON.stringify(value))],
              logs: [],
              block_height: 1,
              block_hash: "11111111111111111111111111111111",
            },
          }),
        );
        return;
      }
      if (rpc.params?.request_type === "call_function") {
        assert.equal(rpc.params.block_id, "test-final-block");
        const args = JSON.parse(
          Buffer.from(rpc.params.args_base64 ?? "", "base64").toString("utf8"),
        ) as {
          authorization?: string;
        };
        const authorization = JSON.parse(args.authorization ?? "{}") as {
          purpose?: string;
          payload?: string;
          signature?: { msg?: { payload?: string } };
        };
        const payload = authorization.purpose
          ? authorization.payload
          : authorization.signature?.msg?.payload;
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              block_hash: "test-final-block",
              result: [...Buffer.from(JSON.stringify({ payload }))],
            },
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            account_id: accountId,
            amount: "0",
            locked: "0",
            code_hash: "1".repeat(64),
            storage_usage: 0,
            storage_paid_at: 0,
            global_contract_account_id: contracts.get(accountId),
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    contracts,
    globalCodeHashes,
    intentsHeld,
  };
}

export async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
