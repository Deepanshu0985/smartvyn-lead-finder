import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE, sessionToken } from "@/lib/auth";
import { getStore, storageMode } from "@/lib/store";
import { timeAgo } from "@/lib/telegram";
import type { Status, StoredPost } from "@/lib/types";
import { logout, setStatus } from "./actions";
import { CopyButton } from "./CopyButton";
import { LoginForm } from "./LoginForm";
import { RunNow } from "./RunNow";

export const metadata: Metadata = { title: "Lead Finder · Smartvyn", robots: { index: false } };
export const dynamic = "force-dynamic";
// Server actions on this page (Run now) inherit this limit.
export const maxDuration = 300;

const TABS: { key: Exclude<Status, "ignored">; label: string }[] = [
  { key: "new", label: "New" },
  { key: "replied", label: "Replied" },
  { key: "skipped", label: "Skipped" },
];

function scoreStyle(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (score >= 65) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function StatusButton({ id, status, label }: { id: string; status: Status; label: string }) {
  return (
    <form action={setStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{label}</button>
    </form>
  );
}

/** Wall-clock time, read once per request outside the component bodies. */
const currentTimeMs = () => Date.now();

function PostCard({ p, nowMs }: { p: StoredPost; nowMs: number }) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ${scoreStyle(p.score)}`}>{p.score}</span>
        <span className="font-medium text-slate-700">{p.type === "client_lead" ? "Client lead" : "Question to answer"}</span>
        <span>r/{p.subreddit}</span>
        <span>{timeAgo(p.postedAt, nowMs)}</span>
        <span>· {p.service}</span>
      </div>
      <h2 className="mt-2 text-base font-semibold text-slate-900">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-violet-700 hover:underline">
          {p.title}
        </a>
      </h2>
      <p className="mt-1 text-sm text-slate-600">{p.reason}</p>
      {p.draft ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">{p.draft}</pre>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No draft was generated. Write your own reply.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.draft && <CopyButton text={p.draft} />}
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
          Open post
        </a>
        {p.status !== "replied" && <StatusButton id={p.id} status="replied" label="Mark replied" />}
        {p.status !== "skipped" && <StatusButton id={p.id} status="skipped" label="Skip" />}
        {p.status !== "new" && <StatusButton id={p.id} status="new" label="Move back to New" />}
      </div>
    </article>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const token = sessionToken();
  const session = (await cookies()).get(COOKIE)?.value;
  if (!token || session !== token) {
    return (
      <main className="min-h-dvh bg-slate-50 px-4">
        <LoginForm />
      </main>
    );
  }

  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "new";
  const store = getStore();
  const counts = Object.fromEntries(await Promise.all(TABS.map(async (t) => [t.key, (await store.list(t.key, 200)).length])));
  const posts = await store.list(active, 100);
  const nowMs = currentTimeMs();

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Smartvyn Lead Finder</h1>
            <p className="text-sm text-slate-500">Best matches first. You review and post by hand; nothing is ever posted for you.</p>
          </div>
          <div className="flex items-start gap-2">
            <RunNow />
            <form action={logout}>
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Sign out</button>
            </form>
          </div>
        </header>

        {storageMode() === "memory" && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Using temporary in-memory storage. Set SUPABASE_URL and SUPABASE_SECRET_KEY so leads survive between runs.
          </p>
        )}

        <nav className="mt-6 flex gap-2">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/dashboard?tab=${t.key}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                t.key === active ? "bg-violet-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {t.label} ({counts[t.key]})
            </a>
          ))}
        </nav>

        <div className="mt-4 space-y-4">
          {posts.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nothing here yet.</p>
          ) : (
            posts.map((p) => <PostCard key={p.id} p={p} nowMs={nowMs} />)
          )}
        </div>
      </div>
    </main>
  );
}
