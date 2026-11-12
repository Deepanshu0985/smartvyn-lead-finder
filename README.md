# Smartvyn Lead Finder

Finds fresh Reddit posts from people who need what Smartvyn builds, ranks them with Mistral, drafts a human-sounding reply, and sends the best ones to your phone on Telegram. **You review each draft and post it yourself.** Nothing is ever posted to Reddit automatically.

```
every ~3 hours (GitHub Actions)
  └─ POST /api/run
       1. read the newest posts from your subreddits         (read-only)
       2. cheap keyword filter, skip old / seen / "[For Hire]" posts
       3. Mistral: client lead, question worth answering, or noise? score 0-100
       4. Mistral: draft a reply for anything scoring 60+
       5. save to Supabase, send the best (up to 8) to Telegram
you: tap the Telegram message → open the post → edit the draft → post it
```

There is also a password-protected dashboard at `/dashboard` with Copy, Mark replied and Skip buttons, and a Run now button.

## It cannot post to Reddit

- The only write-shaped Reddit call is the OAuth **token request**, using the app-only `client_credentials` grant, which cannot act as a user at all. Everything else is a `GET` of a public listing.
- `tests/readonly.test.ts` fails if a Reddit write endpoint (`/api/comment`, `/api/submit`, `/api/vote`, ...) or a user-level OAuth grant ever appears in `src/`.

## Setup

### 1. Supabase (storage)
Create a free project, open **SQL editor**, and run `supabase/schema.sql`. Then copy the **project URL** and the **secret key** (Project settings → API Keys). The secret key is server-side only: never put it in browser code or commit it.

### 2. Telegram bot (where leads arrive)
1. In Telegram, message **@BotFather**, send `/newbot`, follow the prompts, and copy the **token**.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy `"chat":{"id": ...}`. That number is your **chat id**.

### 3. Reddit (read-only access)
Go to https://www.reddit.com/prefs/apps → **create another app** → type **script**, redirect URI `http://localhost:8080`. Copy the **client id** (under the app name) and the **secret**. Reddit may ask you to request or agree to API access first; follow what it shows.
Without these, the app tries Reddit's public JSON, which Reddit often blocks from cloud servers.

### 4. Deploy on Vercel
Import this repo, then add these environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `MISTRAL_API_KEY` | your Mistral key |
| `DASHBOARD_PASSWORD` | a strong password |
| `CRON_SECRET` | a long random string (`openssl rand -hex 32`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | from step 2 |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | from step 1 |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | from step 3 |

### 5. Schedule it (GitHub Actions)
Vercel's free plan only allows a daily cron, so `.github/workflows/run.yml` triggers a run every 3 hours. In the GitHub repo add two secrets (Settings → Secrets and variables → Actions):
- `APP_URL`: your Vercel URL, no trailing slash
- `CRON_SECRET`: the same value as on Vercel

Then open the **Actions** tab, pick **Run lead finder**, and click **Run workflow** to test it. (GitHub pauses scheduled workflows after 60 days without repo activity; just re-enable it if that happens.)

### 6. First run
Open `/dashboard`, sign in, and press **Run now**. The result line tells you how many posts were fetched, how many matched, and how many leads were sent.

## Tuning

Everything is in **`src/config.ts`**: the subreddit list, keywords, minimum score, leads per run, the cap on AI calls per run (cost control), and where a portfolio link is allowed in a draft. Edit, commit, done.

## Develop and test locally

```bash
npm install
npm test            # 57 tests: filter, AI parsing, whole pipeline, Telegram, storage, read-only guard
```

Try the whole app offline with fake Reddit data and a fake Mistral/Telegram:

```bash
node scripts/make-fixture.mjs /tmp/reddit-fixture.json
npm run mock        # fake Mistral + Telegram on :8787 (leave running)

# in another terminal
MISTRAL_API_KEY=x MISTRAL_API_BASE=http://localhost:8787/v1 \
TELEGRAM_API_BASE=http://localhost:8787 TELEGRAM_BOT_TOKEN=1:x TELEGRAM_CHAT_ID=1 \
CRON_SECRET=test DASHBOARD_PASSWORD=pw REDDIT_FIXTURE_FILE=/tmp/reddit-fixture.json \
npm run dev

curl -X POST -H "Authorization: Bearer test" http://localhost:3000/api/run
curl http://localhost:8787/sent     # the Telegram messages that would have been sent
```

## Good to know

- **Cost:** one small Mistral call per new matching post (capped at 20 per run) plus one per lead for the draft. Posts already seen are never re-checked.
- **A failed AI call is retried next run**; a failed Telegram send is retried next run.
- **Drafts are a starting point.** Edit them in your own voice before posting, and follow each subreddit's rules on self-promotion. By default links are only allowed in drafts for hiring boards.
- Posts are treated as untrusted text: the prompts tell the model never to follow instructions found inside a post.
