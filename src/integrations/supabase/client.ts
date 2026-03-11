import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Main Connection
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lhkrxbhqagvuetoigqkl.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxoa3J4YmhxYWd2dWV0b2lncWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NzQ0MjYsImV4cCI6MjA4MjQ1MDQyNn0.nhez87dpIOxo-pU16jH7oaXn44VTGO0CHAAA2-aSn5A";

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
