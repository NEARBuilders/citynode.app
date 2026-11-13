import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDotEnv } from "../tests/regression/lib/regression-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = readDotEnv(root);
const appUrl = (process.env.BASE_URL || fileEnv.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const port = Number(process.env.DEMO_LOGIN_PORT || 4599);
const seedFile = path.join(root, ".bos", "demo", "seed.json");

function loadSeed() {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`${path.relative(root, seedFile)} is missing — run pnpm run seed:demo first`);
  }
  return JSON.parse(fs.readFileSync(seedFile, "utf-8"));
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
}

function index(seed) {
  const rows = Object.entries(seed.personas)
    .map(
      ([persona, person]) =>
        `<li><a href="/${persona}">${escapeHtml(persona)}</a> — ${escapeHtml(person.name)} (${escapeHtml(person.communities.join(", ") || "no community")})</li>`,
    )
    .join("");
  const people = Object.values(seed.people)
    .map((person) => `<a href="/${person.key}">${escapeHtml(person.name)}</a>`)
    .join(" · ");
  return `<!doctype html><meta charset="utf-8"><title>Demo sign-in</title><body style="font-family:sans-serif;max-width:48rem;margin:2rem auto"><h1>Sign in as</h1><ul>${rows}</ul><h2>Everyone else</h2><p>${people}</p><p><a href="/signout">Sign out</a></p></body>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const key = decodeURIComponent(url.pathname.slice(1));
  const to = url.searchParams.get("to") || "/dashboard";
  let seed;
  try {
    seed = loadSeed();
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(error instanceof Error ? error.message : String(error));
    return;
  }
  if (!key) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(index(seed));
    return;
  }
  if (key === "signout") {
    response.writeHead(302, {
      location: `${appUrl}/`,
      "set-cookie": "better-auth.session_token=; Path=/; Max-Age=0",
    });
    response.end();
    return;
  }
  const person = seed.personas[key] ?? seed.people[key];
  if (!person) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end(`Unknown persona ${key}`);
    return;
  }
  response.writeHead(302, {
    location: `${appUrl}${to.startsWith("/") ? to : `/${to}`}`,
    "set-cookie": person.cookies.map(
      (cookie) =>
        `${cookie.name}=${encodeURIComponent(cookie.value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(cookie.expires * 1000).toUTCString()}`,
    ),
  });
  response.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[demo-login] http://localhost:${port} — pick a persona to sign in to ${appUrl}`);
});
