// GET /api/send-reminders
// Triggered on a schedule by Vercel Cron (see vercel.json).
// For every active task whose reminder_time has passed "today" in the
// owning user's timezone, with no completion logged for today and no
// reminder already sent today, this sends an email via Resend and
// stamps last_reminder_sent_date so it won't fire twice.
//
// Required env vars (set in Vercel > Project > Settings > Environment Variables):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (service role — server-side only, NEVER exposed to the browser)
//   RESEND_API_KEY
//   REMINDER_FROM_EMAIL         (e.g. "Morning Routine <reminders@yourdomain.com>")
//   CRON_SECRET                 (optional — protects this endpoint from random public calls)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REMINDER_FROM_EMAIL;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing Supabase service credentials' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, title, user_id, reminder_time, last_reminder_sent_date, duration_minutes, profiles!inner(email, full_name, timezone, reminders_enabled)')
      .eq('is_active', true)
      .not('reminder_time', 'is', null);

    if (error) throw error;

    let checked = 0, sent = 0;
    const results = [];

    for (const task of tasks || []) {
      checked++;
      const profileRow = task.profiles;
      if (!profileRow || profileRow.reminders_enabled === false || !profileRow.email) continue;

      const tz = profileRow.timezone || 'UTC';
      const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      const todayLocal = nowInTz.toISOString().slice(0, 10); // approx local date

      if (task.last_reminder_sent_date === todayLocal) continue; // already sent today

      const [h, m] = task.reminder_time.split(':').map(Number);
      const reminderMinutes = h * 60 + m;
      const nowMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();
      if (nowMinutes < reminderMinutes) continue; // not due yet

      // has it been completed today already?
      const { data: completion } = await supabase
        .from('task_completions')
        .select('id')
        .eq('task_id', task.id)
        .eq('log_date', todayLocal)
        .maybeSingle();

      if (completion) continue; // already done, no reminder needed

      // send email
      if (resendKey && fromEmail) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: profileRow.email,
            subject: `Reminder: "${task.title}" is still open today`,
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                <h2 style="margin-bottom:8px">Hey ${profileRow.full_name || 'there'} 👋</h2>
                <p>You haven't marked <strong>${escapeHtml(task.title)}</strong> as done yet today
                   (${task.duration_minutes || 0} min, due by ${task.reminder_time.slice(0,5)}).</p>
                <p>Jump back in and keep your streak alive.</p>
              </div>`
          })
        });
      }

      await supabase.from('tasks').update({ last_reminder_sent_date: todayLocal }).eq('id', task.id);
      sent++;
      results.push({ task: task.title, user: profileRow.email });
    }

    return res.status(200).json({ ok: true, checked, sent, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
