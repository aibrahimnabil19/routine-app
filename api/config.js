// GET /api/config
// Exposes only the PUBLIC supabase url + anon key to the browser.
// These are safe to expose (that's what the anon key + RLS is for),
// but keeping them server-side means you configure them once in
// Vercel's dashboard instead of hardcoding them in committed files.
export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars' });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
