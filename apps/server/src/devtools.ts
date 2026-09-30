import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

/**
 * Eines de desenvolupament per a l'editor del mapa (només amb `--dev` i des de localhost):
 *   GET  /dev/corrections  → contingut de tools/map-import/corrections.json
 *   PUT  /dev/corrections  → el desa i torna a generar el mapa (npm run map:import, amb la cache)
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CORRECTIONS_FILE = `${ROOT}tools/map-import/corrections.json`;
const MAX_BODY = 2 * 1024 * 1024;

let importing: Promise<{ ok: boolean; log: string }> | null = null;

function runImporter(): Promise<{ ok: boolean; log: string }> {
  importing ??= new Promise<{ ok: boolean; log: string }>((resolve) => {
    const child = spawn(process.execPath, ["tools/map-import/src/index.ts"], { cwd: ROOT });
    let log = "";
    child.stdout.on("data", (d: Buffer) => (log += d.toString()));
    child.stderr.on("data", (d: Buffer) => (log += d.toString()));
    child.on("close", (code) => resolve({ ok: code === 0, log }));
  }).finally(() => {
    importing = null;
  });
  return importing;
}

function isLocal(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("massa gran"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Retorna true si ha atès la petició. */
export async function handleDevRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (!pathname.startsWith("/dev/")) return false;
  if (!isLocal(req)) {
    json(res, 403, { error: "només des de localhost" });
    return true;
  }
  if (pathname === "/dev/corrections" && req.method === "GET") {
    const text = existsSync(CORRECTIONS_FILE) ? await readFile(CORRECTIONS_FILE, "utf8") : "null";
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(text);
    return true;
  }
  if (pathname === "/dev/corrections" && req.method === "PUT") {
    let data: unknown;
    try {
      data = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: "JSON invàlid" });
      return true;
    }
    const c = data as { version?: number; buildings?: unknown; added?: unknown; platforms?: unknown };
    if (c?.version !== 1 || typeof c.buildings !== "object" || !Array.isArray(c.added) || !Array.isArray(c.platforms)) {
      json(res, 400, { error: "format de correccions invàlid" });
      return true;
    }
    await writeFile(CORRECTIONS_FILE, `${JSON.stringify(c, null, 2)}\n`);
    const result = await runImporter();
    json(res, result.ok ? 200 : 500, result);
    return true;
  }
  json(res, 404, { error: "no trobat" });
  return true;
}
