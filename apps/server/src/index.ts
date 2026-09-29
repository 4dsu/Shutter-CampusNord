import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WS_PATH } from "@shutter/shared/constants";
import { PROTOCOL_VERSION } from "@shutter/shared/protocol";
import { serveStatic } from "./static.ts";

const PORT = Number(process.env.PORT ?? 3000);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION }));
    return;
  }
  serveStatic(req, res).catch((err: unknown) => {
    console.error("[http]", err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ t: "hello", protocol: PROTOCOL_VERSION }));
});

httpServer.listen(PORT, () => {
  console.log(`[server] escoltant a http://localhost:${PORT} (WebSocket a ${WS_PATH})`);
});
