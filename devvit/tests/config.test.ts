// devvit.json is checked against Reddit's own published schema, and cross-checked against the
// code, so a typo cannot slip through to `devvit upload`.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/routes";
import { devvitConfig } from "../src/config";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const config = JSON.parse(read("../devvit.json"));
const schema = JSON.parse(read("../node_modules/@devvit/shared-types/schemas/config-file.v1.json"));

describe("devvit.json", () => {
  it("is valid against Reddit's published config schema", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    // The config schema references a products schema and a custom string format.
    ajv.addSchema(JSON.parse(read("../node_modules/@devvit/shared-types/schemas/products.json")));
    ajv.addFormat("https-url", /^https:\/\//);
    const validate = ajv.compile(schema);
    const ok = validate(config);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("really does reject bad configs (so the check above is not vacuous)", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    ajv.addSchema(JSON.parse(read("../node_modules/@devvit/shared-types/schemas/products.json")));
    ajv.addFormat("https-url", /^https:\/\//);
    const validate = ajv.compile(schema);
    expect(validate({ ...config, name: "Bad Name!" })).toBe(false);
    expect(validate({ ...config, scheduler: { tasks: { x: { endpoint: "/not-internal", cron: "* * * * *" } } } })).toBe(false);
    expect(validate({ ...config, permissions: { ...config.permissions, http: { domains: "api.mistral.ai" } } })).toBe(false);
    const { server: _server, ...noServer } = config;
    expect(validate(noServer)).toBe(false);
  });

  it("has a valid app name", () => {
    expect(config.name).toMatch(/^[a-z][a-z0-9-]{2,19}$/);
  });

  it("points at the bundle that the build script writes", () => {
    expect(`${config.server.dir}/${config.server.entry}`).toBe("dist/server/index.js");
    expect(read("../scripts/build.mjs")).toContain('outfile: "dist/server/index.js"');
    expect(read("../scripts/build.mjs")).toContain('format: "cjs"');
  });

  it("allows outgoing requests to exactly Mistral and Telegram", () => {
    expect([...config.permissions.http.domains].sort()).toEqual(["api.mistral.ai", "api.telegram.org"]);
  });

  it("handles every internal endpoint that it declares", async () => {
    const endpoints = [
      ...Object.values<{ endpoint: string }>(config.scheduler.tasks).map((t) => t.endpoint),
      ...config.menu.items.map((i: { endpoint: string }) => i.endpoint),
    ];
    expect(endpoints.length).toBe(2);
    for (const path of endpoints) {
      const r = await handleRequest("POST", path, async () => ({ fetched: 0, candidates: 0, newCandidates: 0, classified: 0, leadsFound: 0, notified: 0, skippedByCap: 0, errors: [] }));
      expect(r.status, path).not.toBe(404);
    }
  });

  it("declares every secret the code reads, as secrets", () => {
    const used = [...read("../src/run.ts").matchAll(/getSetting\("(\w+)"\)/g)].map((m) => m[1]).sort();
    expect(used).toEqual(["mistralApiKey", "telegramBotToken", "telegramChatId"]);
    for (const name of used) expect(config.settings.global[name].isSecret, name).toBe(true);
  });

  it("runs every 30 minutes so leads are fresh", () => {
    expect(config.scheduler.tasks["find-leads"].cron).toBe("*/30 * * * *");
  });

  it("only looks at fresh posts", () => {
    expect(devvitConfig.maxPostAgeHours).toBeLessThanOrEqual(12);
  });

  it("keeps each run small enough to finish quickly", () => {
    expect(devvitConfig.maxAiCallsPerRun).toBeLessThanOrEqual(8);
    expect(devvitConfig.maxLeadsPerRun).toBeLessThanOrEqual(5);
  });
});
