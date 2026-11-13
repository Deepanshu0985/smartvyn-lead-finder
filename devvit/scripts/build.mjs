// Bundles the server into one self-contained CommonJS file, which is what Devvit Web requires
// (devvit.json: server.dir/server.entry). `devvit upload` and `devvit playtest` run this.
import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "none",
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
}
