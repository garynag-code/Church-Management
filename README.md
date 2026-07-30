# Ecclesia Glocal Church Family Connect — Zero-Cost PWA

*Forming Christ, Driving Change.*

A modern, installable **Progressive Web App** for church operations. Runs on
**Android and iOS** (and desktop) from one codebase, with **no app-store fees,
no domain cost, and no paid services**.

- 🎨 Modern high-definition UI (indigo + gold), light & dark theme
- 🔐 Secure login (salted SHA-256 locally; Supabase Auth when synced)
- 👥 Roles: Administrator, Pastoral Core, Senior Pastor, Domain Cell Leader, Member
- 🌐 Domain Cells (Church = primary/master DB) + Family, Politics, Business, Education, Arts & Media, each with multiple leaders
- 📣 Announcements published **globally** (whole church) or **locally** (one cell)
- 📝 Full member registration (name, surname, age, gender, school, cell number, email, address, family group, occupation, company, domain cell)
- 📍 Connect Groups by geographic area — monthly meetings + feedback
- 🔔 Free reminders/notifications (Web Notification API)
- 🙏 Prayer requests + prayer tools, ✨ moderated testimonies
- 📴 Offline-capable (service worker)

## Run it (free, no build step)

It's plain HTML/CSS/JS — no npm install, no bundler.

```bash
cd church-app
python3 -m http.server 8080
# open http://localhost:8080
```

The **first account you create becomes the Administrator**. Everyone else
registers as a Member; the Admin can change roles under **More → Administration**.

## Deploy free (pick one)

- **GitHub Pages** — push the repo, enable Pages, point it at `/church-app`.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop the `church-app` folder.

All have a $0 tier and give you a free `*.pages.dev` / `*.netlify.app` /
`*.vercel.app` URL — no custom domain needed. To install on a phone: open the
URL → browser menu → **Add to Home Screen**.

## Two modes (both free)

| | LOCAL (default) | SYNC |
|---|---|---|
| Data | This device (localStorage) | Shared across users |
| Login | Local salted hash | Supabase Auth (email verify, reset) |
| Setup | none | paste 2 keys into `js/config.js` |
| Cost | $0 | $0 on Supabase free tier |

### Turn on cross-user sync (optional, still free)

1. Create a free project at <https://supabase.com>.
2. In **Project Settings → API**, copy the **Project URL** and **anon key**.
3. Paste both into `church-app/js/config.js`.
4. Run this SQL once in Supabase (**SQL Editor**) to create the tables:

```sql
-- one table per collection used by the app
create table if not exists users          (id text primary key, "createdAt" bigint, data jsonb) ;
-- For a quick start you can instead create typed columns matching the objects
-- in js/db.js. Enable Row Level Security and add policies before going live.
```

> The included adapter reads/writes each collection by name (`users`,
> `announcements`, `connectGroups`, `meetings`, `feedback`, `prayerRequests`,
> `testimonies`, `notifications`, `cellLeaders`, `duties`). Create a table per
> collection with the fields shown in `js/db.js`, then enable **Row Level
> Security** with policies appropriate to each role.

## ⚠️ Flags — costs, best practices & risks

**Cost:** Nothing is required to pay. The only latent cost is if a very large
congregation exceeds Supabase/hosting **free-tier limits** — small/medium
churches stay at $0. SMS was deliberately excluded (it always costs); reminders
use free web/in-app notifications instead.

**Privacy / compliance (mandatory, free to do):** You are storing personal data
(addresses, ages, possibly minors' school info). You must: obtain consent (the
registration form does), publish a privacy policy, limit retention, and handle
minors' data carefully (POPIA/GDPR).

**Security best practices:**
- LOCAL mode stores data in the browser and is best for a single owner/demo. For
  real multi-user data, enable SYNC mode **and turn on Supabase Row Level
  Security** — never expose the master database without per-role policies.
- The Supabase *anon* key is safe to ship; the *service_role* key is **not** —
  never put it in this client.
- Content (prayers, testimonies) is **moderated** before publishing to reduce
  abuse and oversharing of others' private details.
- iOS shows PWA notifications only for **installed** apps (Add to Home Screen).

**Not included (would need a paid or more complex setup):** true background push
when the app is closed requires a push server + VAPID keys; email delivery at
volume; and automated backups beyond the free tier.
