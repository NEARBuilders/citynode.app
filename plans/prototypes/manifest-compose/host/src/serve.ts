/**
 * Tiny static server for built node-SSR remote bundles (prod-shape loading:
 * the host's MF runtime fetches remote entries over HTTP — never from disk;
 * ADR 0007 §4 / plan 034's loud-failure rule).
 *
 * usage: bun src/serve.ts <port> <dir> [<port> <dir>]...
 */
const args = process.argv.slice(2);
const servers: Array<{ stop: Promise<void>; url: string }> = [];

for (let i = 0; i < args.length; i += 2) {
  const port = Number(args[i]);
  const root = args[i + 1]!;
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const file = Bun.file(`${root}${url.pathname}`);
      const stat = await file.exists();
      if (!stat) return new Response("not found", { status: 404 });
      return new Response(file);
    },
  });
  servers.push({ stop: server.stop, url: `http://localhost:${port}` });
  console.log(`serving ${root} at http://localhost:${port}`);
}

process.on("SIGTERM", () => process.exit(0));
