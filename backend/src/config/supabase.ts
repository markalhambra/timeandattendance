import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const STORAGE_BUCKET = 'tams-files';

// Lazy initialisation — avoids crashing the server if env vars are missing
// (e.g. local dev without Supabase configured). File-upload endpoints will
// return a 503 if the client isn't configured.
let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for file uploads.');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}
