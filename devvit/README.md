# Smartvyn Lead Finder as a Reddit (Devvit) app

The same lead finder as the Next.js app, but running **inside Reddit** on Reddit's Devvit platform.
Every 30 minutes it searches Reddit for fresh posts, ranks them with Mistral, drafts a reply, and
sends the best to your Telegram. **You review and post by hand; nothing is ever posted for you.**

Why Devvit: Reddit's docs say a Devvit app does **not** need a `reddit.com/prefs/apps` app or API
keys: "Devvit handles authentication automatically when you enable the reddit permission".
It also needs no Vercel, no Supabase and no GitHub Actions: Reddit runs it, stores its data in
Devvit's built-in Redis, and schedules it.

```
every 30 min (Devvit scheduler)  ->  POST /internal/cron/find-leads
  1. read newest posts from ~15 subreddits (reddit.getNewPosts) + 5 Reddit-wide searches (reddit.searchPosts)
  2. cheap keyword filter, skip old / seen / "[For Hire]" posts          (shared/prefilter.ts)
  3. Mistral: client lead, question worth answering, or noise? score 0-100 (shared/classify.ts)
  4. Mistral: draft a reply for anything scoring 60+
  5. remember it in Redis, send the best (up to 5) to Telegram
you: open the Telegram message -> open the post -> edit the draft -> post it yourself
```

## It cannot post to Reddit
- The code calls exactly two Reddit methods: `getNewPosts` and `searchPosts`.
- `tests/readonly.test.ts` fails if any other `reddit.` method, or any write method name
  (`submitComment`, `submitPost`, `upvote`, ...), ever appears in `devvit/src` or `shared`, and if
  `devvit.json` asks to act as a user.
- Devvit's `reddit` permission is all-or-nothing, so the platform would technically allow writes.
  The guarantee is in the code and the tests, not in the permission.

## Setup (on your own computer, Node 22+)

1. **Install**
   ```bash
   cd devvit
   npm install
   ```
2. **Log in as your Smartvyn Reddit account** (opens your browser):
   ```bash
   npx devvit login
   ```
3. **Make a tiny private subreddit** to install the app in (Devvit apps run inside a subreddit).
   Create it on Reddit, e.g. `smartvyn_leads_test`, set it to private. An uploaded app can only be
   installed on a subreddit with fewer than 200 members, and is visible only to you.
4. **Upload.** This builds the bundle (`npm run build`) and uploads it:
   ```bash
   npx devvit upload
   ```
   The app name `smartvyn-leads` must be unique on Reddit. If it is taken, change `name` in
   `devvit.json` (3-20 characters: lowercase letters, numbers, hyphens).
5. **Set the secrets** (you will be prompted for each value, so they never appear in chat or in git):
   ```bash
   npx devvit settings set mistralApiKey
   npx devvit settings set telegramBotToken
   npx devvit settings set telegramChatId
   ```
6. **Install it in your test subreddit and watch it start:**
   ```bash
   npx devvit playtest smartvyn_leads_test
   ```
   (or `npx devvit install smartvyn_leads_test smartvyn-leads`, then `npx devvit logs smartvyn_leads_test`).
7. **Try it now instead of waiting 30 minutes.** In the subreddit, open the moderator tools menu and
   choose **Run Smartvyn lead finder now**. A toast tells you how many posts were checked, how many
   leads were found and how many went to Telegram.

After that it runs by itself every 30 minutes.

## Tuning
Subreddits, keywords, Reddit-wide search queries, the minimum score and the link policy are in
`../shared/config.ts` (shared with the Next.js app). Per-run caps for Devvit are in `src/config.ts`.
The schedule is the `cron` in `devvit.json`.

## Develop and test
```bash
npm test            # 48 tests: Reddit reading, Redis storage, whole run, routes, devvit.json vs Reddit's schema, read-only guard
npm run typecheck   # against the real @devvit types
npm run build       # writes dist/server/index.js (one self-contained CommonJS file)
```

## Not verified yet (needs a real Reddit login, which only you have)
- That Reddit accepts the outgoing-request domains (`api.mistral.ai`, `api.telegram.org`) without a
  separate approval step. If `devvit upload` or the first run complains about a domain, that is it.
- That `reddit.getNewPosts` may read subreddits where the app is **not** installed. Reddit's docs
  confirm `reddit.searchPosts` searches all of Reddit. If subreddit listings are refused, the
  toast and logs show `r/<name>: <error>` for each, and the Reddit-wide searches still run.
- How long Reddit lets a scheduled task run. Each run is deliberately small (6 AI checks, 5 leads)
  and runs often instead.
