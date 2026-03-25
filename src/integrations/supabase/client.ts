import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Main Connection
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://onobornmnzemgsduscug.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ub2Jvcm5tbnplbWdzZHVzY3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNzAxNDAsImV4cCI6MjA4Mzg0NjE0MH0.QzeFMCwDN-9ZVYm1GmaH9wOIPpfhTTjn_sMvS-PoHPw";

// Secondary Connection (optional - falls back to main if not set)
const SUPABASE_TATICA_URL = import.meta.env.VITE_SUPABASE_TATICA_URL || SUPABASE_URL;
const SUPABASE_TATICA_KEY = import.meta.env.VITE_SUPABASE_TATICA_ANON_KEY || SUPABASE_KEY;

// Only true when a distinct secondary project URL is explicitly configured
export const HAS_SECONDARY_PROJECT = !!(import.meta.env.VITE_SUPABASE_TATICA_URL && import.meta.env.VITE_SUPABASE_TATICA_URL !== SUPABASE_URL);

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
