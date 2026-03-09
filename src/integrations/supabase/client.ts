import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Main Connection - MUST be set via environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Secondary Connection (optional - falls back to main if not set)
const SUPABASE_TATICA_URL = import.meta.env.VITE_SUPABASE_TATICA_URL || SUPABASE_URL;
const SUPABASE_TATICA_KEY = import.meta.env.VITE_SUPABASE_TATICA_ANON_KEY || SUPABASE_KEY;

// Default client
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Secondary client (synonymous with main unless env vars redirect)
export const supabaseTatica = createClient<Database>(SUPABASE_TATICA_URL, SUPABASE_TATICA_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'sb-tatica-auth-token',
  }
});
