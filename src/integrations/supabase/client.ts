import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

export const supabase: SupabaseClient | null = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
