# Enable the free Supabase backend (multi-user sync)

This turns the app from single-device into a real multi-user app: shared
logins, shared data, and leaders seeing engagement from **all** members.
Everything here is on Supabase's **free tier**.

## 1. Create a project (2 minutes, free)
1. Go to <https://supabase.com> → sign up → **New project**.
2. Give it a name and a database password (save it somewhere).
3. Wait for it to finish provisioning.

## 2. Create the database table
In the project, open **SQL Editor** → **New query**, paste this, and run it:

```sql
-- One generic table holds every record the app uses.
create table if not exists public.records (
  id         text primary key,
  collection text  not null,
  created_at bigint not null,
  data       jsonb not null
);
create index if not exists records_collection_idx on public.records (collection);

-- Turn on Row Level Security.
alter table public.records enable row level security;

-- INTERIM (MVP) policy: the app's public "anon" key may read/write.
-- Good enough to launch for a trusted congregation, but note the caveat below.
create policy "app anon access" on public.records
  for all to anon
  using (true) with check (true);
```

## 3. Get your two keys
**Project Settings → API**:
- **Project URL** — looks like `https://abcd1234.supabase.co`
- **anon public** key — a long string labelled *anon / public* (safe to ship)

## 4. Paste them into the app
Edit `js/config.js`:

```js
export const SUPABASE_URL = "https://abcd1234.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...your anon key...";
```

Commit + push. On next load the top of the app will show **Synced**, and
data is now shared across everyone's devices.

> Tip: register the **first** account right after enabling sync — it becomes
> the Administrator for the shared database.

## ⚠️ Security note — read before going live with real data
The interim policy above lets anyone holding the shipped anon key read/write
the `records` table. That's fine for a **trusted congregation MVP**, but it is
**not** true per-user security, and you're storing personal data (addresses,
and possibly minors' info).

For a hardened launch, move to **Supabase Auth** (real email/password accounts)
and replace the interim policy with per-row rules (e.g. members read their own
domain/group, admins read all, the preaching roster stays admin-only). This is
a follow-up step — ask and it can be implemented and tested against your
project.

Also do the basics: publish a short **privacy policy**, keep the consent
checkbox (already in registration), and set a data-retention approach
(POPIA/GDPR).

## Rolling back
To go back to local mode, blank out the two values in `js/config.js` again.
Local mode stores data only in each browser.
