import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// A sessão é gerenciada pelo Clerk, não pelo supabase-js — em vez de
// auth.storage/persistSession, cada request carrega o token da sessão
// Clerk atual (Supabase valida via Third-Party Auth).
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => {
    const token = await (window as any).Clerk?.session?.getToken();
    return token ?? null;
  },
});