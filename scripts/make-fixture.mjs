// Copies fixtures/reddit-sample.json with timestamps shifted so the posts look fresh,
// for trying the app locally without touching Reddit:
//   node scripts/make-fixture.mjs /tmp/reddit-fixture.json
//   REDDIT_FIXTURE_FILE=/tmp/reddit-fixture.json npm run dev
import { readFileSync, writeFileSync } from "node:fs";

const REFERENCE = 1791000000; // the "now" the fixture was written against
const out = process.argv[2] || "/tmp/reddit-fixture.json";
const shift = Math.floor(Date.now() / 1000) - REFERENCE;
const listing = JSON.parse(readFileSync(new URL("../fixtures/reddit-sample.json", import.meta.url), "utf8"));
for (const child of listing.data.children) child.data.created_utc += shift;
writeFileSync(out, JSON.stringify(listing));
console.log(`Wrote ${out} (${listing.data.children.length} posts, shifted by ${shift}s)`);
