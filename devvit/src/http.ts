import type { ServerResponse } from "node:http";

/**
 * Sends a JSON reply. Devvit's runtime refuses a response that has no Content-Length header
 * ("server responded with Content-Length header null but greater than zero required"), and Node
 * falls back to chunked transfer when it is missing, so it is always set explicitly here.
 */
export function sendJson(res: Pick<ServerResponse, "writeHead" | "end">, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
