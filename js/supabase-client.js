// ============================================================
// Supabase client
// SUPABASE_URL and SUPABASE_ANON_KEY are injected at request time
// by the tiny /api/config endpoint (see api/config.js) so that you
// never have to hardcode secrets in this file or commit them.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;

export async function getSupabase() {
  if (_client) return _client;

  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error('Could not load app config. Have you set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel env vars?');
  }
  const { supabaseUrl, supabaseAnonKey } = await res.json();

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return _client;
}
