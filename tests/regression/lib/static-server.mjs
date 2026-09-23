import { createServer } from "node:http";
import path from "node:path";
import sirv from "sirv";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "X-Requested-With, content-type",
};

/**
 * Static server for a locally built remote dist (ADR 0009): the production
 * stack loads every module — host, ui, api, plugins — over HTTP exactly as it
 * would from a CDN, so the fixture serves each dist root with CORS headers.
 */
export function startStaticServer(rootDir, port) {
  const serve = sirv(path.resolve(rootDir), {
    dev: false,
    setHeaders: (res) => {
      for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);
    },
  });

  const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    serve(req, res, () => {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end("Not Found");
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export function stopStaticServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}
