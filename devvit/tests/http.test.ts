import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { sendJson } from "../src/http";

describe("sendJson", () => {
  it("sets Content-Length to the byte length, counting multi-byte characters", () => {
    const calls: { status: number; headers: Record<string, string | number> }[] = [];
    let ended = "";
    const fakeRes = {
      writeHead: (status: number, headers: Record<string, string | number>) => { calls.push({ status, headers }); },
      end: (chunk: string) => { ended = chunk; },
    } as unknown as Parameters<typeof sendJson>[0];
    sendJson(fakeRes, 200, { showToast: "Checked 14 posts · 6 leads ✅" });
    expect(ended).toBe('{"showToast":"Checked 14 posts · 6 leads ✅"}');
    expect(calls[0].status).toBe(200);
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].headers["Content-Length"]).toBe(Buffer.byteLength(ended));
    expect(Buffer.byteLength(ended)).toBeGreaterThan(ended.length); // the ✅ and · are multi-byte
  });

  it("produces a real HTTP response with Content-Length and no chunked encoding (what Reddit requires)", async () => {
    const server = createServer((_req, res) => sendJson(res, 200, { status: "ok", note: "naïve ✅" }));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://localhost:${port}/`);
      const text = await res.text();
      expect(res.headers.get("content-length")).toBe(String(Buffer.byteLength(text)));
      expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
      expect(res.headers.get("transfer-encoding")).toBeNull();
      expect(JSON.parse(text)).toEqual({ status: "ok", note: "naïve ✅" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("is the only way the server entry point writes a response", async () => {
    const { readFileSync } = await import("node:fs");
    const entry = readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8");
    expect(entry).toContain("sendJson(res, status, body)");
    expect(entry).not.toMatch(/res\.(writeHead|end)\(/);
  });
});
