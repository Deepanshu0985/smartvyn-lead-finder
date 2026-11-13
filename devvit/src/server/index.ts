// Entry point bundled into dist/server/index.js. Thin on purpose: it only wires Devvit's real
// clients into the testable code in ../routes.ts and ../run.ts.

import { createServer, getServerPort, reddit, redis, settings } from "@devvit/web/server";
import { handleRequest } from "../routes";
import { runFinder } from "../run";

const server = createServer(async (req, res) => {
  const { status, body } = await handleRequest(req.method, req.url, () =>
    runFinder({
      reddit,
      redis,
      getSetting: (name) => settings.get<string>(name),
    }),
  );
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
});

server.on("error", (err) => console.error(`Server error: ${err.stack}`));
server.listen(getServerPort());
