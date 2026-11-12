-- Storage for the Smartvyn Lead Finder. Run once in the Supabase SQL editor.
--
-- The app talks to this table with the project's SECRET key (server-side only, set as
-- SUPABASE_SECRET_KEY on Vercel, never in browser code). Row level security is on with no
-- policies, so the public/anon key can read and write nothing.

create table if not exists public.posts (
  id text primary key,                 -- Reddit's short post id
  subreddit text not null,
  title text not null,
  url text not null,
  author text not null default '',
  body text not null default '',
  posted_at timestamptz not null,      -- when the post was created on Reddit
  fetched_at timestamptz not null default now(),
  type text not null check (type in ('client_lead', 'question_to_answer', 'irrelevant')),
  score integer not null default 0 check (score between 0 and 100),
  service text not null default 'other',
  reason text not null default '',
  draft text not null default '',
  status text not null default 'new' check (status in ('new', 'replied', 'skipped', 'ignored')),
  notified boolean not null default false
);

create index if not exists posts_status_score_idx on public.posts (status, score desc, posted_at desc);

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
