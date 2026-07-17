# Morning — a personal routine & goal tracker

A small web app (vanilla HTML/CSS/JS + Supabase) for tracking daily goals:

- Sign up / sign in with email + password (Supabase Auth)
- **Simple habits** — plain daily checkbox goals with streaks
- **Alternating goals** — give it a list (e.g. book titles) and it rotates:
  you finish "Atomic Habits" → it automatically activates the next book in
  your list. Add more items to the list any time.
- Streak tracking (current + longest) per goal
- A daily-routine dashboard matching the reference mobile design
- Email reminders: if a goal has a reminder time and isn't marked done by
  then, a Vercel Cron job emails you (via Resend)
- Settings: display name, timezone, toggle reminders on/off

---

## 1. Create the Supabase project

1. Go to https://supabase.com → New project.
2. Open **SQL Editor** → paste the contents of `supabase-schema.sql` → Run.
   This creates the `profiles`, `tasks`, `task_items`, `task_completions`
   tables, row-level security policies, and a trigger that auto-creates a
   profile row when someone signs up.
3. In **Authentication → Providers**, email/password is enabled by default.
   Optionally turn off "Confirm email" while testing so signup logs you in
   immediately.
4. Grab your keys from **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret — server only)

## 2. Set up email sending (for reminders)

The reminder cron uses [Resend](https://resend.com) (generous free tier).

1. Create a Resend account, verify a sending domain (or use their test domain
   while developing).
2. Grab an API key → `RESEND_API_KEY`.
3. Pick a from-address → `REMINDER_FROM_EMAIL`, e.g.
   `Morning Routine <reminders@yourdomain.com>`.

You can swap in any other email API (SendGrid, Postmark, etc.) by editing
the `fetch('https://api.resend.com/emails' ...)` call in
`api/send-reminders.js`.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo, then **Import Project** in Vercel
   (or run `vercel` from the CLI inside this folder).
2. In **Project Settings → Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | from step 1 |
   | `SUPABASE_ANON_KEY` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 (server-only) |
   | `RESEND_API_KEY` | from step 2 |
   | `REMINDER_FROM_EMAIL` | from step 2 |
   | `CRON_SECRET` | any random string, e.g. `openssl rand -hex 16` (optional but recommended) |

3. Deploy. Vercel will pick up `vercel.json`, which schedules
   `/api/send-reminders` to run every 15 minutes.

   > **Note:** Vercel's **Hobby (free) plan** limits cron jobs to once per
   > day. If you're on Hobby, either accept a once-daily reminder sweep, or
   > upgrade to Pro for the 15-minute schedule. You can edit the `schedule`
   > cron expression in `vercel.json` either way.

4. If you set `CRON_SECRET`, Vercel automatically sends it as a Bearer
   token to cron-triggered requests — no extra config needed on Vercel's
   side; the check in `api/send-reminders.js` just guards against random
   public GET requests to that URL.

## 4. Run locally

Because the app calls `/api/config` and `/api/send-reminders`, use the
Vercel CLI so those serverless functions work locally too:

```bash
npm install -g vercel
vercel dev
```

Then create a `.env.local` file (not committed) with the same variables
listed in step 3, and open the printed local URL.

---

## File map

```
index.html              Sign in / sign up page
dashboard.html           Main app (matches the reference design)
css/style.css             All styling
js/supabase-client.js     Loads Supabase config from /api/config and creates the client
js/auth.js                Sign in / sign up logic
js/dashboard.js           Tasks, streaks, alternating-goal rotation, settings
api/config.js             Serves public Supabase URL/anon key to the browser
api/send-reminders.js     Cron job: emails users about overdue tasks
supabase-schema.sql       Full DB schema + RLS policies
vercel.json               Cron schedule
```

## How the alternating goal rotation works

Each `alternating` task owns a list in `task_items` (`pending` / `active`
/ `done`). Exactly one item is `active` at a time — that's what shows in
the task card ("Now: Atomic Habits"). When you mark the task done for the
day:

1. The completion is logged with a snapshot of which item was active.
2. That item flips to `done`.
3. The next `pending` item (lowest `position`) flips to `active`.
4. If nothing is left, you get a toast telling you to add more items —
   open the goal (✎) and add new ones any time; they queue up after the
   existing list.

## Extending it

- Add push notifications by swapping the email step for a service like
  OneSignal.
- Add a weekly progress view by querying `task_completions` grouped by
  week.
- Add categories/tags to `tasks` if your list grows large.
